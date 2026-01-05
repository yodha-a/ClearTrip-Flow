import { useState, useRef, useEffect } from "react";
import "./PanoramaCreator.css";

declare global {
  interface Window {
    cv: any;
  }
}

interface UploadedImage {
  id: number;
  file: File;
  url: string;
  name: string;
}

interface PanoramaCreatorProps {
  onClose: () => void;
  onSave: (imageUrl: string, name: string) => void;
}

export function PanoramaCreator({ onClose, onSave }: PanoramaCreatorProps) {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [panorama, setPanorama] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState("");
  const [opencvReady, setOpencvReady] = useState(false);
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const [showNameModal, setShowNameModal] = useState(false);
  const [panoramaName, setPanoramaName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Load OpenCV script if not already loaded
    if (window.cv && window.cv.Mat) {
      setOpencvReady(true);
      //   addLog("✓ OpenCV loaded successfully!");
    } else {
      //   addLog("⏳ Loading OpenCV library...");

      // Check if script already exists
      const existingScript = document.querySelector('script[src*="opencv.js"]');
      if (!existingScript) {
        const script = document.createElement("script");
        script.src = "https://docs.opencv.org/4.8.0/opencv.js";
        script.async = true;
        document.body.appendChild(script);
      }

      const checkOpenCV = setInterval(() => {
        if (window.cv && window.cv.Mat) {
          setOpencvReady(true);
          //   addLog("✓ OpenCV loaded successfully!");
          clearInterval(checkOpenCV);
        }
      }, 100);

      return () => clearInterval(checkOpenCV);
    }
  }, []);

  const addLog = (message: string) => {
    setStatusLog((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] ${message}`,
    ]);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    files.sort((a, b) => {
      const numA = parseInt(a.name.replace(/\D/g, "").slice(-1));
      const numB = parseInt(b.name.replace(/\D/g, "").slice(-1));
      const order = [2, 1, 0, 3, 4];
      const indexA = order.indexOf(numA);
      const indexB = order.indexOf(numB);
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }
      return a.name.localeCompare(b.name);
    });

    const newImages = files.map((file, idx) => ({
      id: Date.now() + idx,
      file,
      url: URL.createObjectURL(file),
      name: file.name,
    }));
    setImages([...images, ...newImages]);
    addLog(`✓ Uploaded ${files.length} image(s)`);
  };

  const moveImage = (index: number, direction: "up" | "down") => {
    const newImages = [...images];
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex >= 0 && newIndex < newImages.length) {
      [newImages[index], newImages[newIndex]] = [
        newImages[newIndex],
        newImages[index],
      ];
      setImages(newImages);
    }
  };

  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    setImages(newImages);
  };

  const loadImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  };

  const cropPanorama = (pano: any, h_dst: number, corners: number[][]) => {
    const cv = window.cv;
    const min_x = Math.floor(Math.min(...corners.map((c) => c[0])));
    const min_y = Math.floor(Math.min(...corners.map((c) => c[1])));
    const t_y = -min_y;

    let crop_x_start = 0;
    let crop_x_end = pano.cols;
    let crop_y_start = t_y;
    let crop_y_end = Math.min(t_y + h_dst, pano.rows);

    if (corners[0][0] < 0) {
      const n = Math.abs(corners[1][0] - corners[0][0]);
      crop_x_start = Math.max(0, Math.floor(n));
    } else {
      const end_x = Math.min(corners[2][0], corners[3][0]);
      crop_x_end = Math.min(pano.cols, Math.ceil(end_x));
    }

    // Use min_x to adjust crop if needed
    if (min_x < 0) {
      crop_x_start = Math.max(crop_x_start, Math.floor(-min_x));
    }

    crop_x_start = Math.max(0, crop_x_start);
    crop_x_end = Math.min(pano.cols, crop_x_end);
    crop_y_start = Math.max(0, crop_y_start);
    crop_y_end = Math.min(pano.rows, crop_y_end);

    const width = crop_x_end - crop_x_start;
    const height = crop_y_end - crop_y_start;

    if (width <= 0 || height <= 0) {
      return pano;
    }

    const rect = new cv.Rect(crop_x_start, crop_y_start, width, height);
    const cropped = pano.roi(rect);
    const result = cropped.clone();
    cropped.delete();

    return result;
  };

  const stitchTwoImages = async (
    dst_img: any,
    src_img: any,
    imageNum: number
  ) => {
    const cv = window.cv;
    addLog(`Processing image pair ${imageNum}...`);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const gray_dst = new cv.Mat();
    const gray_src = new cv.Mat();
    cv.cvtColor(dst_img, gray_dst, cv.COLOR_RGBA2GRAY);
    cv.cvtColor(src_img, gray_src, cv.COLOR_RGBA2GRAY);

    addLog(`  → Detecting ORB features (2000 features)...`);
    const orb = new cv.ORB(2000);
    const kp_dst = new cv.KeyPointVector();
    const kp_src = new cv.KeyPointVector();
    const desc_dst = new cv.Mat();
    const desc_src = new cv.Mat();

    orb.detectAndCompute(gray_dst, new cv.Mat(), kp_dst, desc_dst);
    orb.detectAndCompute(gray_src, new cv.Mat(), kp_src, desc_src);

    addLog(`  → Found ${kp_dst.size()} and ${kp_src.size()} keypoints`);

    if (kp_dst.size() < 4 || kp_src.size() < 4) {
      throw new Error("Not enough features detected");
    }

    addLog(`  → Matching features with Lowe's ratio test (0.75)...`);
    const bf = new cv.BFMatcher(cv.NORM_HAMMING, false);
    const matches = new cv.DMatchVectorVector();
    bf.knnMatch(desc_src, desc_dst, matches, 2);

    const good_matches: any[] = [];
    for (let i = 0; i < matches.size(); i++) {
      const match_pair = matches.get(i);
      if (match_pair.size() >= 2) {
        const m = match_pair.get(0);
        const n = match_pair.get(1);
        if (m.distance < 0.75 * n.distance) {
          good_matches.push(m);
        }
      }
    }

    addLog(`  → Found ${good_matches.length} good matches`);

    if (good_matches.length < 4) {
      throw new Error("Not enough good matches - check image overlap");
    }

    const src_pts: number[] = [];
    const dst_pts: number[] = [];
    for (const m of good_matches) {
      const kp1 = kp_src.get(m.queryIdx);
      const kp2 = kp_dst.get(m.trainIdx);
      src_pts.push(kp1.pt.x, kp1.pt.y);
      dst_pts.push(kp2.pt.x, kp2.pt.y);
    }

    const src_mat = cv.matFromArray(
      good_matches.length,
      1,
      cv.CV_32FC2,
      src_pts
    );
    const dst_mat = cv.matFromArray(
      good_matches.length,
      1,
      cv.CV_32FC2,
      dst_pts
    );

    addLog(`  → Computing homography with RANSAC (5.0)...`);
    const mask = new cv.Mat();
    const H = cv.findHomography(src_mat, dst_mat, cv.RANSAC, 5.0, mask);

    let inlierCount = 0;
    for (let i = 0; i < mask.rows; i++) {
      if (mask.ucharAt(i, 0) > 0) inlierCount++;
    }
    addLog(`  → Inliers: ${inlierCount}/${good_matches.length}`);

    const h_src = src_img.rows;
    const w_src = src_img.cols;
    const h_dst = dst_img.rows;
    const w_dst = dst_img.cols;

    const pts1 = [
      [0, 0],
      [0, h_src],
      [w_src, h_src],
      [w_src, 0],
    ];

    const pts1_mat = cv.matFromArray(4, 1, cv.CV_32FC2, pts1.flat());
    const pts1_transformed = new cv.Mat();
    cv.perspectiveTransform(pts1_mat, pts1_transformed, H);

    const corners_src: number[][] = [];
    for (let i = 0; i < 4; i++) {
      corners_src.push([
        pts1_transformed.floatAt(i, 0),
        pts1_transformed.floatAt(i, 1),
      ]);
    }

    const corners_dst = [
      [0, 0],
      [0, h_dst],
      [w_dst, h_dst],
      [w_dst, 0],
    ];

    const all_corners = [...corners_src, ...corners_dst];

    const min_x = Math.min(...all_corners.map((c) => c[0]));
    const min_y = Math.min(...all_corners.map((c) => c[1]));
    const max_y = Math.max(...all_corners.map((c) => c[1]));

    const t_x = -min_x;
    const t_y = -min_y;

    const side = corners_src[0][0] < 0 ? "left" : "right";

    const width_pano =
      side === "left" ? Math.ceil(w_dst + t_x) : Math.ceil(corners_src[3][0]);
    const height_pano = Math.ceil(max_y - min_y);

    addLog(`  → Canvas: ${width_pano}x${height_pano}px (side: ${side})`);

    const Ht = cv.Mat.eye(3, 3, cv.CV_64F);
    Ht.doublePtr(0, 2)[0] = t_x;
    Ht.doublePtr(1, 2)[0] = t_y;

    const H_final = new cv.Mat();
    cv.gemm(Ht, H, 1, new cv.Mat(), 0, H_final);

    const src_warped = new cv.Mat();
    cv.warpPerspective(
      src_img,
      src_warped,
      H_final,
      new cv.Size(width_pano, height_pano),
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar(0, 0, 0, 0)
    );

    const dst_resized = new cv.Mat(
      height_pano,
      width_pano,
      cv.CV_8UC3,
      new cv.Scalar(0, 0, 0)
    );

    const dst_x = side === "left" ? Math.round(t_x) : 0;
    const dst_y = Math.round(t_y);

    for (let y = 0; y < h_dst; y++) {
      for (let x = 0; x < w_dst; x++) {
        const target_y = y + dst_y;
        const target_x = x + dst_x;
        if (
          target_y >= 0 &&
          target_y < height_pano &&
          target_x >= 0 &&
          target_x < width_pano
        ) {
          const src_ptr = dst_img.ucharPtr(y, x);
          const dst_ptr = dst_resized.ucharPtr(target_y, target_x);
          for (let c = 0; c < 3; c++) {
            dst_ptr[c] = src_ptr[c];
          }
        }
      }
    }

    addLog(`  → Advanced multi-band blending...`);

    const pano = new cv.Mat(
      height_pano,
      width_pano,
      cv.CV_8UC3,
      new cv.Scalar(0, 0, 0)
    );

    const mask_dst = new cv.Mat(
      height_pano,
      width_pano,
      cv.CV_8U,
      new cv.Scalar(0)
    );
    const mask_src = new cv.Mat(
      height_pano,
      width_pano,
      cv.CV_8U,
      new cv.Scalar(0)
    );

    for (let y = 0; y < height_pano; y++) {
      for (let x = 0; x < width_pano; x++) {
        const dst_pix = dst_resized.ucharPtr(y, x);
        const src_pix = src_warped.ucharPtr(y, x);

        if (dst_pix[0] + dst_pix[1] + dst_pix[2] > 10) {
          mask_dst.ucharPtr(y, x)[0] = 255;
        }
        if (src_pix[3] > 10) {
          mask_src.ucharPtr(y, x)[0] = 255;
        }
      }
    }

    const overlap = new cv.Mat();
    cv.bitwise_and(mask_dst, mask_src, overlap);

    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    cv.erode(mask_dst, mask_dst, kernel);
    cv.erode(mask_src, mask_src, kernel);
    cv.erode(overlap, overlap, kernel);

    const dist_dst = new cv.Mat();
    const dist_src = new cv.Mat();
    cv.distanceTransform(mask_dst, dist_dst, cv.DIST_L2, 3);
    cv.distanceTransform(mask_src, dist_src, cv.DIST_L2, 3);

    cv.GaussianBlur(dist_dst, dist_dst, new cv.Size(11, 11), 0);
    cv.GaussianBlur(dist_src, dist_src, new cv.Size(11, 11), 0);

    for (let y = 0; y < height_pano; y++) {
      for (let x = 0; x < width_pano; x++) {
        const dst_pix = dst_resized.ucharPtr(y, x);
        const src_pix = src_warped.ucharPtr(y, x);
        const pano_pix = pano.ucharPtr(y, x);

        const has_dst = mask_dst.ucharPtr(y, x)[0] > 0;
        const has_src = mask_src.ucharPtr(y, x)[0] > 0;
        const in_overlap = overlap.ucharPtr(y, x)[0] > 0;

        if (in_overlap) {
          const d_dst = dist_dst.floatAt(y, x);
          const d_src = dist_src.floatAt(y, x);
          const total = d_dst + d_src;

          if (total > 0.01) {
            const w_dst = d_dst / total;
            const w_src = d_src / total;

            for (let c = 0; c < 3; c++) {
              pano_pix[c] = Math.round(dst_pix[c] * w_dst + src_pix[c] * w_src);
            }
          } else {
            for (let c = 0; c < 3; c++) {
              pano_pix[c] = Math.round((dst_pix[c] + src_pix[c]) / 2);
            }
          }
        } else if (has_dst) {
          for (let c = 0; c < 3; c++) {
            pano_pix[c] = dst_pix[c];
          }
        } else if (has_src && src_pix[3] > 10) {
          for (let c = 0; c < 3; c++) {
            pano_pix[c] = src_pix[c];
          }
        }
      }
    }

    mask_dst.delete();
    mask_src.delete();
    overlap.delete();
    kernel.delete();
    dist_dst.delete();
    dist_src.delete();

    addLog(`  → Cropping to content...`);
    const cropped_pano = cropPanorama(pano, h_dst, corners_src);

    gray_dst.delete();
    gray_src.delete();
    kp_dst.delete();
    kp_src.delete();
    desc_dst.delete();
    desc_src.delete();
    matches.delete();
    src_mat.delete();
    dst_mat.delete();
    mask.delete();
    H.delete();
    pts1_mat.delete();
    pts1_transformed.delete();
    Ht.delete();
    H_final.delete();
    src_warped.delete();
    dst_resized.delete();
    pano.delete();

    addLog(`  ✓ Stitched pair ${imageNum}`);
    return cropped_pano;
  };

  const stitchWithOpenCV = async () => {
    if (images.length < 2) {
      alert("Please upload at least 2 images");
      return;
    }

    if (!opencvReady) {
      alert("OpenCV is still loading...");
      return;
    }

    const cv = window.cv;
    setProcessing(true);
    setPanorama(null);
    setStatusLog([]);
    setProgress("Starting...");
    addLog("=== PANORAMA STITCHING STARTED ===");

    try {
      setProgress("Loading images...");
      const loadedImages = await Promise.all(
        images.map((img) => loadImage(img.url))
      );
      addLog(`✓ Loaded ${loadedImages.length} images`);

      setProgress("Converting to OpenCV...");
      const mats = loadedImages.map((img, idx) => {
        const canvas = document.createElement("canvas");
        const width = img.width;
        const height = img.height;

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { alpha: false });
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, width, height);
        }
        addLog(`  → Image ${idx + 1}: ${width}x${height}px`);
        return cv.imread(canvas);
      });

      setProgress("Stitching panorama...");
      let panoramaResult = mats[0].clone();

      for (let i = 1; i < mats.length; i++) {
        setProgress(`Stitching image ${i + 1} of ${mats.length}...`);
        panoramaResult = await stitchTwoImages(panoramaResult, mats[i], i);
      }

      setProgress("Generating high-quality output...");
      const canvas = document.createElement("canvas");
      cv.imshow(canvas, panoramaResult);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            setPanorama(url);
            addLog(
              `✓ Complete! Final size: ${canvas.width}x${canvas.height}px`
            );
            setProcessing(false);
            // Show name modal after creation
            setShowNameModal(true);
          }
        },
        "image/png",
        1.0
      );

      mats.forEach((mat) => mat.delete());
      panoramaResult.delete();
    } catch (error: any) {
      setProgress("Error");
      addLog(`❌ ${error.message}`);
      console.error("Full error:", error);
      alert(`Error: ${error.message}`);
      setProcessing(false);
    }
  };

  const handleSavePanorama = () => {
    if (panorama && panoramaName.trim()) {
      onSave(panorama, panoramaName.trim());
      setShowNameModal(false);
      onClose();
    }
  };

  const handleDownload = () => {
    if (panorama) {
      const a = document.createElement("a");
      a.href = panorama;
      a.download = `${panoramaName || "panorama"}.png`;
      a.click();
    }
  };

  return (
    <div className="panorama-creator-overlay">
      <div className="panorama-creator-modal">
        <div className="panorama-creator-header">
          <h2>Create Panorama</h2>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="panorama-creator-content">
          {!opencvReady && (
            <div className="opencv-loading">
              <div className="spinner"></div>
              <span>Loading OpenCV...</span>
            </div>
          )}

          {opencvReady && !panorama && (
            <>
              <div
                className="upload-area"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="upload-icon">📷</div>
                <span className="upload-text">Upload Images</span>
                <span className="upload-hint">
                  Upload 2-10 images with 30-50% overlap
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleImageUpload}
                  style={{ display: "none" }}
                />
              </div>

              {images.length > 0 && (
                <div className="images-list">
                  <h3>Images ({images.length})</h3>
                  {images.map((img, index) => (
                    <div key={img.id} className="image-item">
                      <div className="image-controls">
                        <button
                          onClick={() => moveImage(index, "up")}
                          disabled={index === 0}
                          className="move-btn"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveImage(index, "down")}
                          disabled={index === images.length - 1}
                          className="move-btn"
                        >
                          ↓
                        </button>
                      </div>
                      <span className="image-number">{index + 1}</span>
                      <img
                        src={img.url}
                        alt={img.name}
                        className="image-thumb"
                      />
                      <span className="image-name">{img.name}</span>
                      <button
                        onClick={() => removeImage(index)}
                        className="remove-btn"
                      >
                        ×
                      </button>
                    </div>
                  ))}

                  <button
                    onClick={stitchWithOpenCV}
                    disabled={processing || images.length < 2}
                    className="stitch-btn"
                  >
                    {processing ? (
                      <>
                        <div className="spinner small"></div>
                        <span>{progress}</span>
                      </>
                    ) : (
                      "Create Panorama"
                    )}
                  </button>
                </div>
              )}
            </>
          )}

          {panorama && (
            <div className="panorama-result">
              <h3>Panorama Created!</h3>
              <div className="panorama-preview">
                <img src={panorama} alt="Panorama" />
              </div>
            </div>
          )}

          {statusLog.length > 0 && (
            <div className="status-log">
              {statusLog.map((log, i) => (
                <div key={i} className="log-line">
                  {log}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Name Modal */}
      {showNameModal && (
        <div className="name-modal-overlay">
          <div className="name-modal">
            <h3>Name your panorama</h3>
            {panorama && (
              <div className="name-modal-preview">
                <img src={panorama} alt="Preview" />
              </div>
            )}
            <input
              type="text"
              value={panoramaName}
              onChange={(e) => setPanoramaName(e.target.value)}
              placeholder="Enter panorama name..."
              className="name-input"
              autoFocus
            />
            <div className="name-modal-buttons">
              <button onClick={handleDownload} className="download-btn">
                Download
              </button>
              <button
                onClick={handleSavePanorama}
                disabled={!panoramaName.trim()}
                className="save-btn"
              >
                Save & Use
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
