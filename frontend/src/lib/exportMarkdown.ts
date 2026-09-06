import type { JournalEntry } from '../types/entry';

export function generateEntryMarkdown(entry: JournalEntry): string {
  const sections: string[] = [];

  // Header / Title
  sections.push(`# ${entry.title || 'Untitled Reflection'}`);
  sections.push('');

  // Metadata Block
  sections.push('---');
  sections.push(`**Date Created:** ${new Date(entry.createdAt).toLocaleString()}`);
  sections.push(`**Last Updated:** ${new Date(entry.updatedAt).toLocaleString()}`);
  sections.push(`**Emotional Mood:** ${entry.mood}`);
  if (entry.tags && entry.tags.length > 0) {
    sections.push(`**Tags:** ${entry.tags.join(' ')}`);
  }
  if (entry.location && entry.location.name) {
    const loc = entry.location;
    const coords = (loc.lat !== undefined && loc.lng !== undefined) ? ` (${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)})` : '';
    sections.push(`**Location:** ${loc.name}${loc.address ? ` — ${loc.address}` : ''}${coords}`);
  }
  sections.push(`**Word Count:** ${entry.wordCount} words (${entry.charCount} characters)`);
  if (entry.isFavorite) {
    sections.push('**Favorite:** ⭐ Marked as meaningful reflection');
  }
  sections.push('---');
  sections.push('');

  // Main Journal Content
  sections.push('## Reflection');
  sections.push('');
  sections.push(entry.content || '*No reflection content written.*');
  sections.push('');

  // Executive Synthesis & Key Takeaways (if generated)
  if (entry.synthesis) {
    sections.push('---');
    sections.push('## 🤖 Cognitive Agent Synthesis');
    sections.push('');
    if (entry.synthesis.suggestedTitle) {
      sections.push(`**Suggested Title:** *${entry.synthesis.suggestedTitle}*`);
      sections.push('');
    }
    if (entry.synthesis.summary) {
      sections.push(`> ${entry.synthesis.summary}`);
      sections.push('');
    }
    if (entry.synthesis.takeaways && entry.synthesis.takeaways.length > 0) {
      sections.push('### Key Takeaways');
      entry.synthesis.takeaways.forEach((t) => sections.push(`- ${t}`));
      sections.push('');
    }
  }

  // Dialogue History (if present)
  if (entry.dialogueHistory && entry.dialogueHistory.length > 0) {
    sections.push('---');
    sections.push('## 💬 Cognitive Agent Dialogue History');
    sections.push('');
    entry.dialogueHistory.forEach((turn) => {
      const speaker = turn.role === 'user' ? '👤 User' : `🤖 MindMirror Agent (${turn.mode || 'Reflection'})`;
      const time = turn.timestamp ? ` *(${turn.timestamp})*` : '';
      sections.push(`### ${speaker}${time}`);
      sections.push('');
      sections.push(turn.content);
      sections.push('');
    });
  }

  // Footer Note
  sections.push('---');
  sections.push('*Exported securely from MindMirror — Autonomous Reflective Cognition Workspace*');

  return sections.join('\n');
}

export function downloadEntryAsMarkdown(entry: JournalEntry): void {
  const markdownText = generateEntryMarkdown(entry);
  const blob = new Blob([markdownText], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const cleanTitle = (entry.title || 'reflection')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 30);
  const dateStr = new Date(entry.createdAt).toISOString().split('T')[0];
  const filename = `${cleanTitle}_${dateStr}.md`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
