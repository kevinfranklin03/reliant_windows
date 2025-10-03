import React from "react";

export default function Star({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18}
         className={filled ? 'star fill' : 'star'}>
      <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
    </svg>
  );
}
