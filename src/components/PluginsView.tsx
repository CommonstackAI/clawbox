import { useEffect } from 'react'
import { useChannelsStore } from '@/store/channels'
import ChannelList from '@/components/plugins/ChannelList'
import ChannelDetailShell from '@/components/plugins/ChannelDetailShell'

export default function PluginsView() {
  const store = useChannelsStore()

  useEffect(() => {
    store.refreshAll().catch(() => {})
  }, [])

  if (store.selectedChannelId) {
    return (
      <ChannelDetailShell
        channelId={store.selectedChannelId}
        onBack={() => store.closeChannel()}
      />
    )
  }

  return <ChannelList />
}
