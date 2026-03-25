import React from 'react';

function NotificationToast({ notification, onDismiss }) {
  return (
    <div
      className="toast-enter flex items-start gap-2 px-3 py-2 rounded-lg shadow-xl cursor-pointer"
      style={{
        background: 'rgba(15, 23, 42, 0.95)',
        border: '1px solid rgba(212,175,55,0.25)',
        backdropFilter: 'blur(8px)',
        maxWidth: 280,
      }}
      onClick={onDismiss}
    >
      <span className="text-xs text-gray-200 leading-snug flex-1">
        {notification.message ?? notification}
      </span>
      <span className="text-gray-500 text-xs shrink-0 mt-0.5">✕</span>
    </div>
  );
}

export default NotificationToast;
