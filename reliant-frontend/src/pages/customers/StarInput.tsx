import React from "react";
import Star from "./Star";

export default function StarInput({
  value = 0,
  onChange
}: { value?: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1,2,3,4,5].map(i=>(
        <button key={i} type="button" className="star-btn" onClick={()=>onChange(i)} aria-label={`${i} star`}>
          <Star filled={i <= (value||0)} />
        </button>
      ))}
      <span className="text-xs opacity-70 ml-1">{value||0}/5</span>
    </div>
  );
}
