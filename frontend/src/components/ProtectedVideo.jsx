// Prevent the browser's built-in video download affordances where supported.
// This is a deterrent, not DRM: anything playable in a browser can still be captured.
export default function ProtectedVideo({ className = '', ...props }) {
  const preventSave = (event) => {
    event.preventDefault();
  };

  const preventKeyboardSave = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
    }
  };

  return (
    <video
      {...props}
      className={className}
      controlsList="nodownload"
      disablePictureInPicture
      draggable="false"
      onContextMenu={preventSave}
      onDragStart={preventSave}
      onKeyDown={preventKeyboardSave}
    />
  );
}
