export const createLedger = ({
  name,
  type,
  openingBalance = 0,
  openingDate = Date.now()
}) => ({

  name,
  type,

  balance: Number(openingBalance),

  openingBalance: Number(openingBalance),

  openingDate,

  createdAt: Date.now()

});