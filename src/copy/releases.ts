// What's new, shown once after an update. Add an entry (newest first) with every
// release that changes something people will notice; plain words, no jargon.

import type { Release } from '../domain/releases';

export const RELEASES: Release[] = [
  {
    version: '0.7.0',
    items: [
      { title: 'Hold a tab for shortcuts', body: 'Press and hold a tab icon for quick actions. Hold Activity to add spending or income, or scan a receipt, without leaving the screen you’re on.' },
      { title: 'Apple Pay numbers on cards', body: 'Tap-to-pay receipts show a different last four. Add it to the card (Wallet → card → Device Account Number), or pick the card once when you scan, and receipts match it.' },
      { title: 'Sharper receipt reading', body: 'When the first read misses something, the scanner takes a second look in black and white. It also handles shadows, misread digits and starred-out card numbers better, and checks the total against subtotal plus tax.' },
      { title: 'Cards by continent', body: 'The card list now groups by continent, so Canadian and US cards from the same bank show together.' },
    ],
  },
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
