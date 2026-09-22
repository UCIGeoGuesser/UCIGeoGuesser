
interface ExpandViewProps {
  initialSize: string, 
  expandedSize: string, // Must also include pointer-event (i.e. hover, click)
  children: React.ReactNode,
  disableView?: boolean,
}

export default function ExpandView({initialSize, expandedSize, children, disableView}: ExpandViewProps) {


  return (
  <div
    className={` ${initialSize} transition-all duration-300 ease-in-out ${disableView ? "pointer-events-none" : expandedSize} `}
  >
    {children}

  </div>
  );
}