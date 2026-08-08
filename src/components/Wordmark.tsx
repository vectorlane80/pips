export function Wordmark({ small, onClick }: { small?: boolean; onClick?: () => void }) {
  const className = `wordmark${small ? ' wordmark--small' : ''}`
  const content = (
    <>
      <span className="wordmark-mark">
        <span style={{ left: '30%', top: '30%' }} />
        <span style={{ left: '70%', top: '70%' }} />
      </span>
      <span className="wordmark-text">Pips</span>
    </>
  )

  if (onClick) {
    return (
      <button type="button" className={`${className} wordmark--button`} onClick={onClick}>
        {content}
      </button>
    )
  }
  return <span className={className}>{content}</span>
}
