export default function Loading() {
  return (
    <div className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center z-40">
        <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin" />
    </div>
  );
}