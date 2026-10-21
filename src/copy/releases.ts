// What's new, shown once after an update. Add an entry (newest first) with every
// release that changes something people will notice; plain words, no jargon.

import type { Release } from '../domain/releases';

export const RELEASES: Release[] = [
  {
    version: '0.6.0',
    items: [
      { title: 'Quick adds can be income', body: 'Set a quick add to Income for tips, cash or a side gig. One tap logs the money coming in.' },
      { title: 'Cards sorted by country', body: 'Adding a card starts with your country, so the bank list is short. Pick another country any time.' },
      { title: 'New buttons', body: 'Choices are now tiles with a check on the one you picked, and buttons are squared off to match.' },
      { title: 'What’s new', body: 'After an update, this note shows what changed. Find it again under More.' },
    ],
  },
  {
    version: '0.5.8',
    items: [{ title: 'Bills count in their category', body: 'Bills and subscriptions always count toward the plan of the category they’re filed under.' }],
  },
  {
    version: '0.5.7',
    items: [{ title: 'A new look', body: 'A new logo, a product site at tameru.cc, and an install page that walks you through adding Tameru to your Home Screen.' }],
  },
];
