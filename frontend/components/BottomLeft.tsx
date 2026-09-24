interface BottomLeftProps {
  children: React.ReactNode,
  bgColor?: string,
}

export default function BotttomLeft({children, bgColor}: BottomLeftProps) {
  return (
    <div className={`group absolute bottom-2 right-2 ${bgColor || ''}`}>
      {children}
    </div>
  )
}