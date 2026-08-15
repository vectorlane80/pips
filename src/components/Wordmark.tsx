import iconImg from '../assets/pips-icon.png'
import wordmarkImg from '../assets/pips-wordmark.png'

export function Wordmark({ small, onClick }: { small?: boolean; onClick?: () => void }) {
  const className = `wordmark${small ? ' wordmark--small' : ''}`
  const content = (
    <>
      <img src={iconImg} alt="" className="wordmark-icon" />
      <img src={wordmarkImg} alt="Pips" className="wordmark-img" />
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
