import { useState, useRef, useEffect } from "react";
import { ImageNode } from "./ImageNode";
import type { ImageNodeData } from "./ImageNode";
import { PanoramaViewer } from "./PanoramaViewer";
import { PanoramaCreator } from "./PanoramaCreator";
import "./ImageTree.css";
import "./ContextMenu.css";

interface SavedPanorama {
  id: string;
  name: string;
  imageUrl: string;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

export function ImageTree() {
  const [rootNode, setRootNode] = useState<ImageNodeData | null>(null);
  const [pendingParentId, setPendingParentId] = useState<string | null>(null);
  const [pendingImageUrl, setPendingImageUrl] = useState<string | null>(null);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [labelInput, setLabelInput] = useState("");
  const [viewingImage, setViewingImage] = useState<ImageNodeData | null>(null);
  const [isTourMode, setIsTourMode] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: ImageNodeData;
  } | null>(null);
  const [showPanoramaCreator, setShowPanoramaCreator] = useState(false);
  const [savedPanoramas, setSavedPanoramas] = useState<SavedPanorama[]>([]);
  const [showImageSelector, setShowImageSelector] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Log JSON structure whenever it changes
  useEffect(() => {
    if (rootNode) {
      console.log("Current Tree JSON:", JSON.stringify(rootNode, null, 2));
    }
  }, [rootNode]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, node: ImageNodeData) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  };

  const handleAddHotspot = () => {
    if (!contextMenu) return;
    console.log("Add hotspot to:", contextMenu.node.label);
    // Placeholder for hotspot logic
    alert(`Add hotspot functionality for ${contextMenu.node.label}`);
  };

  const handleLinkImage = (childNode: ImageNodeData) => {
    console.log("Link to image:", childNode.label);
    // Placeholder for link logic
    alert(`Link to ${childNode.label}`);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageUrl = e.target?.result as string;
      setPendingImageUrl(imageUrl);
      setShowLabelModal(true);
      setLabelInput("");
    };
    reader.readAsDataURL(file);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleLabelSubmit = () => {
    if (!pendingImageUrl) return;

    const label = labelInput.trim() || "Untitled";

    if (!rootNode) {
      // First image - create root
      setRootNode({
        id: generateId(),
        imageUrl: pendingImageUrl,
        label,
        children: [],
        hotspots: [],
      });
    } else if (pendingParentId) {
      // Adding child to existing node
      setRootNode((prev) => {
        if (!prev) return prev;
        return addChildToNode(prev, pendingParentId, {
          id: generateId(),
          imageUrl: pendingImageUrl,
          label,
          children: [],
          hotspots: [],
        });
      });
      setPendingParentId(null);
    }

    setShowLabelModal(false);
    setPendingImageUrl(null);
    setLabelInput("");
  };

  const handleCancelLabel = () => {
    setShowLabelModal(false);
    setPendingImageUrl(null);
    setLabelInput("");
    setPendingParentId(null);
  };

  const addChildToNode = (
    node: ImageNodeData,
    parentId: string,
    newChild: ImageNodeData
  ): ImageNodeData => {
    if (node.id === parentId) {
      return {
        ...node,
        children: [...node.children, newChild],
      };
    }
    return {
      ...node,
      children: node.children.map((child) =>
        addChildToNode(child, parentId, newChild)
      ),
    };
  };

  const handleAddChild = (parentId: string) => {
    setPendingParentId(parentId);
    setShowImageSelector(true);
  };

  const handleInitialUpload = () => {
    setShowImageSelector(true);
  };

  const handleSelectPanorama = (panorama: SavedPanorama) => {
    setPendingImageUrl(panorama.imageUrl);
    setLabelInput(panorama.name);
    setShowLabelModal(true);
    setShowImageSelector(false);
  };

  const handleUploadFromComputer = () => {
    setShowImageSelector(false);
    fileInputRef.current?.click();
  };

  const handleSavePanorama = (imageUrl: string, name: string) => {
    const newPanorama: SavedPanorama = {
      id: generateId(),
      name,
      imageUrl,
    };
    setSavedPanoramas((prev) => [...prev, newPanorama]);
  };

  const handleImageClick = (node: ImageNodeData) => {
    setViewingImage(node);
  };

  const addHotspotToNode = (
    node: ImageNodeData,
    targetNodeId: string,
    hotspot: any
  ): ImageNodeData => {
    if (node.id === targetNodeId) {
      return {
        ...node,
        hotspots: [...node.hotspots, hotspot],
      };
    }
    return {
      ...node,
      children: node.children.map((child) =>
        addHotspotToNode(child, targetNodeId, hotspot)
      ),
    };
  };

  const handleSaveHotspot = (
    position: any,
    label: string,
    targetNodeId?: string
  ) => {
    if (!viewingImage) return;

    const newHotspot = {
      id: generateId(),
      position,
      type: targetNodeId ? "link" : "info",
      label,
      targetNodeId,
    };

    setRootNode((prev) => {
      if (!prev) return prev;
      const updatedRoot = addHotspotToNode(prev, viewingImage.id, newHotspot);

      // Also update the currently viewing image so the viewer updates immediately
      // We need to find the updated node in the new tree
      const findNode = (n: ImageNodeData, id: string): ImageNodeData | null => {
        if (n.id === id) return n;
        for (const child of n.children) {
          const found = findNode(child, id);
          if (found) return found;
        }
        return null;
      };

      const updatedViewingNode = findNode(updatedRoot, viewingImage.id);
      if (updatedViewingNode) {
        setViewingImage(updatedViewingNode);
      }

      return updatedRoot;
    });
  };

  const handleTourStart = () => {
    if (rootNode) {
      setIsTourMode(true);
      setViewingImage(rootNode);
    }
  };

  const handleNavigate = (targetNodeId: string) => {
    // Find the node in the tree
    const findNode = (n: ImageNodeData, id: string): ImageNodeData | null => {
      if (n.id === id) return n;
      for (const child of n.children) {
        const found = findNode(child, id);
        if (found) return found;
      }
      return null;
    };

    if (rootNode) {
      const targetNode = findNode(rootNode, targetNodeId);
      if (targetNode) {
        setViewingImage(targetNode);
      }
    }
  };

  const handleViewerClose = () => {
    setViewingImage(null);
    setIsTourMode(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleLabelSubmit();
    } else if (e.key === "Escape") {
      handleCancelLabel();
    }
  };

  return (
    <div className="image-tree">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/*"
        style={{ display: "none" }}
      />

      {/* Label Modal */}
      {showLabelModal && (
        <div className="modal-overlay">
          <div className="modal">
            {pendingImageUrl && (
              <div className="modal-preview">
                <img src={pendingImageUrl} alt="Preview" />
              </div>
            )}
            <h3>Add a label for this image</h3>
            <input
              type="text"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter label..."
              className="label-input"
              autoFocus
            />
            <div className="modal-buttons">
              <button onClick={handleCancelLabel} className="cancel-btn">
                Cancel
              </button>
              <button onClick={handleLabelSubmit} className="submit-btn">
                Add Image
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="menu-item" onClick={handleAddHotspot}>
            Add hotspot
          </div>
          {contextMenu.node.children.length > 0 && (
            <>
              <div className="menu-divider"></div>
              <div className="menu-header">Link attached image</div>
              {contextMenu.node.children.map((child) => (
                <div
                  className="menu-item"
                  key={child.id}
                  onClick={() => handleLinkImage(child)}
                >
                  Link {child.label}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Tour Button - Top Right */}
      {rootNode && (
        <button onClick={handleTourStart} className="tour-btn">
          Tour
        </button>
      )}

      {/* Create Panorama Button - Left Side */}
      <button
        onClick={() => setShowPanoramaCreator(true)}
        className="create-pano-btn"
      >
        Create Panorama
      </button>

      {/* Panorama Creator Modal */}
      {showPanoramaCreator && (
        <PanoramaCreator
          onClose={() => setShowPanoramaCreator(false)}
          onSave={handleSavePanorama}
        />
      )}

      {/* Image Selector Modal */}
      {showImageSelector && (
        <div className="modal-overlay">
          <div className="image-selector-modal">
            <div className="image-selector-header">
              <h3>Select an Image</h3>
              <button
                className="close-selector-btn"
                onClick={() => {
                  setShowImageSelector(false);
                  setPendingParentId(null);
                }}
              >
                ×
              </button>
            </div>

            {savedPanoramas.length > 0 && (
              <div className="saved-panoramas-section">
                <h4>Your Panoramas</h4>
                <div className="panorama-grid">
                  {savedPanoramas.map((pano) => (
                    <div
                      key={pano.id}
                      className="panorama-item"
                      onClick={() => handleSelectPanorama(pano)}
                    >
                      <img src={pano.imageUrl} alt={pano.name} />
                      <span>{pano.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="upload-section">
              <button
                onClick={handleUploadFromComputer}
                className="upload-from-computer-btn"
              >
                <span className="upload-icon-small">📁</span>
                Upload from Computer
              </button>
              <button
                onClick={() => {
                  setShowImageSelector(false);
                  setShowPanoramaCreator(true);
                }}
                className="create-pano-in-selector-btn"
              >
                <span className="upload-icon-small">🔗</span>
                Create Panorama
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Panorama Viewer */}
      {viewingImage && rootNode && (
        <PanoramaViewer
          imageUrl={viewingImage.imageUrl}
          currentNode={viewingImage}
          rootNode={rootNode}
          onClose={handleViewerClose}
          onSaveHotspot={handleSaveHotspot}
          isTourMode={isTourMode}
          onNavigate={handleNavigate}
        />
      )}

      {!rootNode ? (
        <div className="upload-prompt" onClick={handleInitialUpload}>
          <div className="upload-box">
            <div className="upload-icon">📷</div>
            <p>Click to upload your first image</p>
          </div>
        </div>
      ) : (
        <div className="tree-wrapper">
          <div className="tree-container">
            <ImageNode
              node={rootNode}
              onAddChild={handleAddChild}
              onImageClick={handleImageClick}
              onContextMenu={handleContextMenu}
            />
          </div>
        </div>
      )}
    </div>
  );
}
