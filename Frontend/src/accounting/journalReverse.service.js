import { createJournalEntry } from "./journal.service";

export const reverseJournal = async (shopId, journal) => {

  const reversedEntries = journal.entries.map(e => ({
    ledgerId: e.ledgerId,
    type: e.type === "debit" ? "credit" : "debit",
    amount: e.amount
  }));

  return createJournalEntry(shopId, {
    narration: `Reversal of ${journal.id}`,
    entries: reversedEntries,
    userId: journal.userId
  });

};