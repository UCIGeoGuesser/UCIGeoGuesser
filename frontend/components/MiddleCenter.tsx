interface MiddleCenterProps {
  children: React.ReactNode,
  bgColor?: string,
}

export default function MiddleCenter({children, bgColor}: MiddleCenterProps) {
  return (
    <div className={`absolute inset-0 z-50 flex items-center justify-center p-4 ${bgColor}`}>
      {children}
    </div>
  )
}