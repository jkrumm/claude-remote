type Priority = 1 | 2 | 3 | 4 | 5

export async function publish(
  topic: string,
  title: string,
  message: string,
  priority: Priority = 3,
  tags?: string[],
) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.NTFY_TOKEN}`,
    Title: title,
    Priority: String(priority),
    'Content-Type': 'text/plain',
  }
  if (tags && tags.length > 0) {
    headers['Tags'] = tags.join(',')
  }
  await fetch(
    `${process.env.NTFY_BASE_URL ?? 'https://ntfy.jkrumm.com'}/${topic}`,
    { method: 'POST', headers, body: message },
  )
}
