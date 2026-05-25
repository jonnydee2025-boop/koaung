export default function Skeleton({ h = 18, w = '100%', r = 6 }) {
  return (
    <div
      style={{
        height: h,
        width: w,
        borderRadius: r,
        background: 'var(--bg-hover)',
        animation: 'shimmer 1.5s infinite',
      }}
    />
  );
}
