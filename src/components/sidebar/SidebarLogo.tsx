import { useEffect, useState } from 'react'
import { useThemeStore } from '@/store/theme'

export function SidebarLogo() {
  const theme = useThemeStore(s => s.theme)
  const [isLightMode, setIsLightMode] = useState(false)

  useEffect(() => {
    const update = () => {
      if (theme === 'light') setIsLightMode(true)
      else if (theme === 'dark') setIsLightMode(false)
      else setIsLightMode(!window.matchMedia('(prefers-color-scheme: dark)').matches)
    }
    update()
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', update)
      return () => mq.removeEventListener('change', update)
    }
  }, [theme])

  const logoSrc = isLightMode ? '/clawbox-logo-light.png?v=2' : '/clawbox-logo-dark.png?v=2'

  return (
    <div className="h-16 px-6 pt-2 flex items-center gap-3 subtle-separator-b">
      <img
        src={logoSrc}
        alt="ClawBox"
        className="h-7 w-auto object-contain"
        key={logoSrc}
      />
    </div>
  )
}
