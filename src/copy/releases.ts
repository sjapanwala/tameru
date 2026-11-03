// What's new, shown once after an update. Add an entry (newest first) with every
// release that changes something people will notice; plain words, no jargon.

import type { Release } from '../domain/releases';

export const RELEASES: Release[] = [
  {
    version: '0.12.0',
    items: [
      { title: 'A tidier card stack', body: 'All accounts is now a summary of what’s left, with your cards resting behind it. Pull down (or tap) to fan them out and tap one to pick it; pull up or tap Done to close. With a card in front, swipe sideways to switch; Show all goes back to the summary.' },
      { title: 'See more', body: 'Recent activity sits in its own panel, with See more underneath to open the full list.' },
      { title: 'Activity, reworked', body: 'Spending for the last 14 days sits on top. Drag across the bars to read any day; let go to show only that day. Open Categories to see where it went, tap a card to see just that card, and use the magnifying glass to search.' },
      { title: 'A clear confirmation', body: 'After you save something, the screen fills with your accent colour and a check, with what you logged (amount, category, account, date) so you can check it. Tap Done, or Undo if it’s wrong.' },
      { title: 'A new look', body: 'One clean light and dark look, with an accent colour you pick in Settings: Blue, Green or Orange. It replaces Paper, Harbor and Kiln; if you’d picked one of those you’re on Blue now. Text uses your phone’s system font, and figures line up.' },
    ],
  },
  {
    version: '0.11.0',
    items: [
      { title: 'A new Home', body: 'Your cards sit in a stack at the top. Swipe to switch between All accounts and each card; safe to spend today, the bar under it and the activity list follow the card you’re on. Swipe a transaction left to remove it.' },
      { title: 'Each card’s share', body: 'Today’s safe to spend is split across your cards by where your spending went over the last 30 days, so the cards always add up to the total.' },
      { title: 'Cards in their own colours', body: 'Each card takes the main colour of its own art. Cards drawn without art now have a chip, your name and Credit or Debit on them.' },
      { title: 'New themes', body: 'Paper (the new default), Harbor and Kiln, each with a light and a dark version. They replace the earlier themes.' },
    ],
  },
  {
    version: '0.10.0',
    items: [{ title: 'Look back at past months', body: 'Tap the calendar next to Plan to open an earlier month and see what you planned and spent in each category. Months with nothing recorded are greyed out.' }],
  },
  {
    version: '0.9.0',
    items: [
      {
        title: 'New themes',
        body: 'Four moods to pick from in Settings: Receipt (thermal paper, all monospace), Almanac (ivory paper, serif figures), Night (always dark) and Contrast (pure black and white). Ink is still the default.',
      },
    ],
  },
  {
    version: '0.8.1',
    items: [
      { title: 'Hold and slide', body: 'Hold a tab, slide your finger up to a shortcut and let go to pick it, all in one motion.' },
      { title: 'Home reaches the top', body: 'The dark panel on Home runs right up under the status bar again.' },
    ],
  },
  {
    version: '0.8.0',
    items: [{ title: 'Themes', body: 'Pick Ink, Paper, Slate, Sage or Dusk in Settings. Same quiet look, on a different paper, each with a light and a dark version.' }],
  },
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
