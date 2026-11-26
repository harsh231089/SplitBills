(function (root) {
  function splitAmount(amount, participantIds) {
    const base = Math.floor(amount / participantIds.length);
    const remainder = amount % participantIds.length;
    return participantIds.map((id, index) => ({ id, amount: base + (index < remainder ? 1 : 0) }));
  }

  function balances(group) {
    const result = Object.fromEntries(group.people.map(person => [person.id, 0]));
    group.expenses.forEach(expense => {
      if (!(expense.paidBy in result)) return;
      const participants = expense.participants.filter(id => id in result);
      if (!participants.length) return;
      result[expense.paidBy] += expense.amount;
      splitAmount(expense.amount, participants).forEach(share => { result[share.id] -= share.amount; });
    });
    group.settlements.forEach(settlement => {
      if (!(settlement.from in result) || !(settlement.to in result)) return;
      result[settlement.from] += settlement.amount;
      result[settlement.to] -= settlement.amount;
    });
    return result;
  }

  function debts(group) {
    const amounts = balances(group);
    const creditors = group.people.filter(person => amounts[person.id] > 0).map(person => ({ ...person, amount: amounts[person.id] }));
    const debtors = group.people.filter(person => amounts[person.id] < 0).map(person => ({ ...person, amount: -amounts[person.id] }));
    const result = [];
    let creditorIndex = 0;
    let debtorIndex = 0;
    while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
      const creditor = creditors[creditorIndex];
      const debtor = debtors[debtorIndex];
      const amount = Math.min(creditor.amount, debtor.amount);
      result.push({ from: debtor.id, to: creditor.id, amount });
      creditor.amount -= amount;
      debtor.amount -= amount;
      if (!creditor.amount) creditorIndex++;
      if (!debtor.amount) debtorIndex++;
    }
    return result;
  }

  const api = { splitAmount, balances, debts };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SplitModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);