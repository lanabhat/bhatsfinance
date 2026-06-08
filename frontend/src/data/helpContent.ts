export const TOOLTIPS: Record<string, string> = {
  // Dashboard
  net_worth:
    'Your total wealth = all assets (savings, investments, FDs, property) minus all liabilities (loans). Updated each time you take a snapshot.',
  xirr:
    'XIRR is your personalised annual return rate. It accounts for when exactly you invested each rupee — similar to how a bank states interest "per year".',

  // Portfolio — Instruments
  instrument_type:
    'The category of your investment:\n• fd = Fixed Deposit\n• rd = Recurring Deposit\n• mf = Mutual Fund\n• equity = Stocks\n• epf = Employee Provident Fund\n• ppf = Public Provident Fund\n• nps = National Pension System\n• gold = Physical / digital gold\n• real_estate = Property\n• bond = Bonds / debentures\n• loan = Money you lent to someone\n• other = Anything else',
  compounding:
    'How often the bank adds interest to your FD principal:\n• monthly — every month\n• quarterly — every 3 months\n• half_yearly — every 6 months\n• annually — once a year\n• simple — no compounding; interest is flat on the original amount only',

  // Portfolio — Accounts
  account_type:
    'Type of financial account:\n• savings — regular bank savings account\n• current — business / current account\n• demat — holds stocks and mutual fund units\n• loan — a liability account (home loan, car loan, etc.)\n• wallet — digital wallet or UPI balance\n• other — anything else',

  // Ledger
  transaction_type:
    'What kind of money movement this is:\n• buy — investing / purchasing units (money goes out)\n• sell — redeeming / selling units (money comes in)\n• deposit — adding cash to a savings / bank account\n• withdrawal — taking cash out of an account\n• salary — income credited from employer\n• dividend — payout from stocks or mutual funds\n• interest — interest earned on FD / savings\n• emi — loan repayment instalment\n• tax_payment — TDS / advance tax paid\n• tax_refund — income tax refund received\n• premium — insurance premium paid\n• loan_disbursal — loan amount received from bank\n• other — any other cash movement',

  // Valuation
  take_snapshot:
    'A snapshot records the current market value of every asset and liability and computes your net worth at that point in time. FD/RD values are auto-calculated; mutual fund / equity values need to be entered manually.',

  // FD Details
  annual_rate: 'The interest rate promised by the bank, stated as % per year (e.g., enter 7.5 for 7.5%).',
  maturity_value: 'The total amount you will receive when the FD matures, including interest.',

  // Expenses
  expense_category:
    'What the expense was for:\n• food — groceries, restaurants, delivery\n• transport — fuel, cab, metro\n• utilities — electricity, water, internet, mobile\n• entertainment — movies, subscriptions, events\n• health — medicines, doctor visits, tests\n• shopping — clothes, electronics, household\n• education — school fees, books, courses\n• rent — house rent / PG\n• emi — loan instalment (auto-deducted from account)\n• other — anything that doesn\'t fit above',
  payment_account:
    'The account or card used to pay for this expense:\n• Choose your bank account if you paid via UPI / NEFT / net banking\n• Choose your credit card account if you swiped / tapped the card\n• Choose your cash account if you paid in physical cash',
}

export type FaqGuide = {
  title: string
  steps: string[]
}

export const FAQ_GUIDES: FaqGuide[] = [
  {
    title: 'How to add a Fixed Deposit (FD)',
    steps: [
      'Go to Portfolio in the sidebar.',
      'Under "Instruments", fill in the name (e.g., "SBI FD — Jan 2024") and set Type to fd.',
      'Enter the allocation percentage and optionally link it to a household member.',
      'Save the instrument — a new "FD Details" section will appear.',
      'Fill in Principal, Annual Rate (%), Investment Date, Maturity Date, and Compounding frequency.',
      'Save FD Details. The app will now auto-calculate the FD value when you take a snapshot.',
      '(Optional) Go to Ledger and record a buy transaction for the FD amount to track it in cash flow.',
    ],
  },
  {
    title: 'How to add a Mutual Fund (MF)',
    steps: [
      'Go to Portfolio → Instruments.',
      'Set Type to mf and give it a name (e.g., "Parag Parikh Flexi Cap").',
      'Save the instrument.',
      'Go to Ledger and record a buy transaction each time you invest (SIP or lump sum). Set Transaction Type to buy.',
      'Each month after receiving your account statement, go to Valuation → Manual Valuation Entry.',
      'Enter today\'s NAV (unit price) or the total current market value for the fund.',
      'Take a snapshot to update your net worth.',
    ],
  },
  {
    title: 'How to add EPF / PPF',
    steps: [
      'Go to Portfolio → Instruments.',
      'Set Type to epf (for Employee Provident Fund) or ppf (for Public Provident Fund).',
      'Enter the name, e.g., "My EPF — Company Name".',
      'Save the instrument.',
      'Fill in FD Details with the current balance as Principal and the applicable interest rate.',
      'Set Compounding to annually (EPF/PPF compound annually).',
      'The app will auto-estimate value at snapshot time. Update the rate each year when the government announces it.',
    ],
  },
  {
    title: 'How to record a salary credit',
    steps: [
      'Go to Ledger in the sidebar.',
      'In the "Transaction Create Form", select your bank account under Account.',
      'Set Transaction Type to salary.',
      'Enter the credited amount under Amount and select the date.',
      'Save — the transaction is added to your ledger and the dashboard cash flow will update.',
    ],
  },
  {
    title: 'How to record a monthly SIP',
    steps: [
      'Go to Ledger.',
      'Select the instrument (your mutual fund) under Instrument.',
      'Select the source account (the bank account the money was debited from) under Account.',
      'Set Transaction Type to buy.',
      'Enter the SIP amount and the date of debit.',
      'Save. Repeat each month, or use the Transaction Correction form to create a copy of a previous SIP.',
    ],
  },
  {
    title: 'How to take a net worth snapshot',
    steps: [
      'Go to Valuation in the sidebar.',
      'At the top, you will see "Take Snapshot". Select the date (today by default).',
      'Click "Take Snapshot". The app will:\n   • Auto-calculate all FD / RD / EPF / PPF values using interest formulas.\n   • Carry forward the last recorded value for stocks and mutual funds.\n   • List instruments that need a manual value entry.',
      'For any instrument listed under "Needs manual entry", go to Manual Valuation Entry below and enter the current market value.',
      'Take the snapshot again — it will update the values and record your final net worth for that date.',
    ],
  },
  {
    title: 'How to view your portfolio allocation',
    steps: [
      'Go to Dashboard in the sidebar.',
      'The "Allocation" pie chart shows how your wealth is split across investment types (FD, MF, equity, etc.).',
      'The "Net Worth Trend" chart shows how your total wealth has changed over time.',
      'To keep these charts accurate, take a snapshot regularly (at least once a month).',
    ],
  },
  {
    title: 'How to record a purchase / everyday expense',
    steps: [
      'Go to Expenses in the sidebar.',
      'Fill in the Date and Amount.',
      'Select a Category (food, transport, shopping, etc.).',
      'Enter a brief Description (e.g., "Grocery run at DMart").',
      'Select the Payment Account — the bank account, credit card, or cash account you used.',
      'Optionally select who paid (Paid By) and who it was for (For Members) if tracking family expenses.',
      'Click Save. The expense is recorded and a corresponding withdrawal transaction is created automatically in the Ledger.',
    ],
  },
  {
    title: 'How to withdraw cash from a bank account',
    steps: [
      'First make sure you have a "Cash" account set up in Portfolio (account type = cash). This represents physical cash on hand.',
      'Go to Accounts & Balance in the sidebar.',
      'Scroll to the "Cash Withdrawal" section.',
      'Select the "From Account" (your bank) and the "To Cash Account" (your cash wallet).',
      'Enter the amount and date, then click "Withdraw Cash".',
      'Two transactions are created automatically: a withdrawal from your bank account and a deposit into your cash account.',
      'Both account balances update immediately.',
    ],
  },
  {
    title: 'How to set up and track a credit card',
    steps: [
      'Go to Portfolio → Accounts.',
      'Create a new account, set Type to credit_card.',
      'Enter the Credit Limit (the bank-approved spending limit, e.g., ₹1,00,000).',
      'Enter the Statement Due Day (the day of month when the bill is due, e.g., 15).',
      'Save the account.',
      'When you make a purchase using this card, go to Expenses, select this credit card as the Payment Account, and record the expense.',
      'Go to Accounts & Balance to see: Outstanding (total spent), Available (limit minus outstanding), and the due day reminder.',
      'When you pay the credit card bill, record a transaction in Ledger: type = deposit or other, direction = inflow, on the credit card account.',
    ],
  },
  {
    title: 'How to correct a wrong transaction',
    steps: [
      'Go to Ledger.',
      'Scroll down to the "Transaction Correction Form".',
      'Select the wrong transaction from the "Original Transaction" dropdown.',
      'Click "Load Selected" — the form pre-fills with the original values.',
      'Edit the fields that were incorrect.',
      'Click "Correct Transaction". The app will reverse the original entry and post a corrected replacement.',
      'The original transaction remains in the ledger for audit purposes.',
    ],
  },
]

export const PAGE_GUIDES: Array<{ page: string; description: string }> = [
  {
    page: 'Dashboard',
    description:
      'Your financial summary at a glance. Shows net worth, XIRR (returns), how your money is allocated across asset types, and how net worth has changed over time.',
  },
  {
    page: 'Portfolio',
    description:
      'Manage your investments (instruments) and bank / demat accounts. Add FDs, mutual funds, stocks, EPF, PPF, gold, etc. here. Also manage who in the family owns which asset.',
  },
  {
    page: 'Ledger',
    description:
      'Record every financial event — salary credits, SIP investments, FD bookings, loan payments, etc. All entries are permanent (immutable). Use the Correction Form to fix mistakes.',
  },
  {
    page: 'Valuation',
    description:
      'Record the current market value of your assets. Use "Take Snapshot" to auto-compute FD values and carry forward the last known values for other assets, then add manual values for MF / stocks.',
  },
  {
    page: 'Accounts & Balance',
    description:
      'See the current balance of every bank / cash account and the outstanding / available limit for each credit card. Also use the Cash Withdrawal shortcut to transfer cash from your bank to your wallet.',
  },
  {
    page: 'Expenses',
    description:
      'Record everyday purchases and bills — groceries, transport, electricity, shopping, etc. Tag each expense with a category, who paid, and which account/card was used. See a monthly breakdown by category.',
  },
  {
    page: 'Cash Flow',
    description:
      'See how money flowed in and out month by month. Income (salary, dividends), expenses (EMI, insurance), and investments (SIPs, FD bookings) are broken out separately.',
  },
  {
    page: 'Tax',
    description: 'Track tax paid, refunds received, and projected tax liability for the year.',
  },
  {
    page: 'Members',
    description: 'Add family members so you can track who owns which account or investment.',
  },
  {
    page: 'Settings',
    description: 'Control which entity types can be deleted to prevent accidental data loss.',
  },
]

export const GETTING_STARTED_STEPS: string[] = [
  'Add your family members under Members (e.g., yourself, spouse).',
  'Add your bank and demat accounts under Portfolio → Accounts.',
  'Add your investments (FDs, mutual funds, stocks, EPF) under Portfolio → Instruments.',
  'For each FD / RD / EPF / PPF, fill in the FD Details (rate, dates, compounding) so values can be auto-calculated.',
  'Record past transactions in Ledger — at minimum, the initial deposits into each account and buy transactions for each investment.',
  'Go to Valuation → Take Snapshot to record your current net worth.',
  'Check Dashboard to see your allocation pie chart and net worth trend.',
]
