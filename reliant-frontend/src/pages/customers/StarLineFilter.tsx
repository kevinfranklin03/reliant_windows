import React from "react";

export default function StarLineFilter({
  value, onChange
}: { value: number | ''; onChange: (v:number|'')=>void }) {
  const selected = typeof value === 'number' ? value : 0;

  return (
    <div className="rs-line-stars">
      <span className="rs-line-stars__label">Satisfaction</span>
      <div className="rs-line-stars__row" role="radiogroup" aria-label="Satisfaction">
        {[1,2,3,4,5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={selected === n}
            aria-label={`${n} star${n>1?'s':''}`}
            className="rs-star-btn"
            onClick={() => onChange(n)}
            title={`Filter: ${n} star${n>1?'s':''}`}
          >
            <svg viewBox="0 0 24 24" width={20} height={20}
                 className={n <= selected ? 'rs-star rs-star--fill' : 'rs-star'}>
              <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}
