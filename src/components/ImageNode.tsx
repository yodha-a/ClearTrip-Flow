import "./ImageNode.css";

export interface Hotspot {
  id: string;
  position: { x: number; y: number; z: number };
  type: "info" | "link";
  label: string;
  targetNodeId?: string;
}

export interface ImageNodeData {
  id: string;
  imageUrl: string;
  label: string;
  children: ImageNodeData[];
  hotspots: Hotspot[];
}

interface ImageNodeProps {
  node: ImageNodeData;
  onAddChild: (parentId: string) => void;
  onImageClick: (node: ImageNodeData) => void;
  onContextMenu: (event: React.MouseEvent, node: ImageNodeData) => void;
}

export function ImageNode({
  node,
  onAddChild,
  onImageClick,
  onContextMenu,
}: ImageNodeProps) {
  const hasChildren = node.children.length > 0;

  return (
    <div className="image-node-container">
      <div className="image-node-row">
        <div className="image-node-wrapper">
          <div
            className="image-node"
            onClick={() => onImageClick(node)}
            onContextMenu={(e) => onContextMenu(e, node)}
            style={{ cursor: "pointer" }}
          >
            <img src={node.imageUrl} alt={node.label} className="node-image" />
          </div>
          <div className="node-label">{node.label}</div>
          {/* Plus button on bottom when no children, or on right side when has children */}
          {!hasChildren && (
            <button
              className="add-button add-button-bottom"
              onClick={() => onAddChild(node.id)}
              title="Add child image"
            >
              <span className="plus-icon">+</span>
            </button>
          )}
          {hasChildren && (
            <button
              className="add-button add-button-right"
              onClick={() => onAddChild(node.id)}
              title="Add child image"
            >
              <span className="plus-icon">+</span>
            </button>
          )}
        </div>
      </div>

      {/* Children with curved connectors */}
      {hasChildren && (
        <div className="children-container">
          <div className="parent-line"></div>
          <div className="children-row">
            {node.children.map((child) => (
              <div key={child.id} className="child-wrapper">
                <ImageNode
                  node={child}
                  onAddChild={onAddChild}
                  onImageClick={onImageClick}
                  onContextMenu={onContextMenu}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
