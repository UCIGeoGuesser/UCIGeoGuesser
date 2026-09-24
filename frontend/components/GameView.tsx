interface GameViewProps {
  imageSrc: string
  children?:  React.ReactNode
}

export default function GameView({imageSrc, children}: GameViewProps) {
  if (children === undefined) {
    return (
      <div className="min-h-screen w-full relative transition-opacity duration-500"
      style={{
        backgroundImage: `url(${imageSrc})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: "#0f172a",
      }} ></div>
    )
  }
  return (
    <div className="min-h-screen w-full relative transition-opacity duration-500"
      style={{
        backgroundImage: `url(${imageSrc})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: "#0f172a",
      }} >
      {children}
    </div>
  )
}