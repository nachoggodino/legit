import React from "react";

/**
 * Three-sparkle AI icon — small, medium, and large stars grouped together.
 *
 * @param {{ size?: number }} props
 */
export default function SparklesIcon({ size = 20 }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      {/* Large center spark */}
      <path d="M12 1l1.5 4.5L18 7l-4.5 1.5L12 13l-1.5-4.5L6 7l4.5-1.5L12 1z" />
      {/* Small top-right spark */}
      <path d="M19 2l0.8 2.2L22 5l-2.2 0.8L19 8l-0.8-2.2L16 5l2.2-0.8L19 2z" />
      {/* Small bottom-left spark */}
      <path d="M6 15l0.7 2L9 17.7 7 18.4 6 20.4l-0.7-2L3 17.7 5 17 6 15z" />
    </svg>
  );
}
