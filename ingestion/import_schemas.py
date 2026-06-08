"""
Field schemas for each import type.
Used by the frontend to drive the mapping UI and by the backend to validate defaults.
"""

IMPORT_SCHEMAS = {
    'transactions': {
        'label': 'Transactions',
        'description': 'Bank statements, UPI exports, credit card transactions',
        'required': [
            {'key': 'tx_date', 'label': 'Date', 'type': 'date'},
            {'key': 'amount', 'label': 'Amount', 'type': 'decimal'},
            {'key': 'direction', 'label': 'Direction', 'type': 'choice',
             'choices': ['INFLOW', 'OUTFLOW']},
            {'key': 'account', 'label': 'Account', 'type': 'fk_account'},
        ],
        'optional': [
            {'key': 'member', 'label': 'Member', 'type': 'fk_member'},
            {'key': 'instrument', 'label': 'Instrument', 'type': 'fk_instrument'},
            {'key': 'transaction_type', 'label': 'Transaction Type', 'type': 'choice',
             'choices': ['DEPOSIT', 'WITHDRAWAL', 'BUY', 'SELL', 'DIVIDEND', 'INTEREST',
                         'SALARY', 'TAX_PAYMENT', 'TAX_REFUND', 'EMI', 'LOAN_DISBURSAL',
                         'PREMIUM', 'OTHER']},
            {'key': 'currency', 'label': 'Currency', 'type': 'string'},
            {'key': 'fees', 'label': 'Fees', 'type': 'decimal'},
            {'key': 'taxes', 'label': 'Taxes', 'type': 'decimal'},
            {'key': 'external_reference', 'label': 'Reference', 'type': 'string'},
        ],
        'system_defaults': {
            'currency': 'INR',
            'fees': '0',
            'taxes': '0',
            'transaction_type': 'OTHER',
        },
    },
    'valuations': {
        'label': 'Valuations / Holdings',
        'description': 'Holdings snapshots from Groww, Upstox, CAMS, or bank balances',
        'required': [
            {'key': 'valuation_date', 'label': 'Valuation Date', 'type': 'date'},
            {'key': 'instrument_name', 'label': 'Instrument Name', 'type': 'string',
             'note': 'Used to look up or create the instrument'},
        ],
        'optional': [
            {'key': 'account_name', 'label': 'Account Name', 'type': 'string',
             'note': 'Use instead of instrument_name for bank/cash balances'},
            {'key': 'unit_price', 'label': 'Unit Price / NAV', 'type': 'decimal'},
            {'key': 'market_value', 'label': 'Current Value', 'type': 'decimal'},
            {'key': 'balance', 'label': 'Balance', 'type': 'decimal'},
            {'key': 'instrument_type', 'label': 'Instrument Type', 'type': 'choice',
             'choices': ['EQUITY', 'MUTUAL_FUND', 'SIP', 'FD', 'RD', 'EPF', 'PPF',
                         'NPS', 'REAL_ESTATE', 'GOLD', 'OTHER'],
             'note': 'Used when creating a new instrument'},
            {'key': 'member_name', 'label': 'Investor / Member', 'type': 'string',
             'note': 'Matched against member names via fuzzy search (e.g. InvestorName from CAMS)'},
            {'key': 'notes', 'label': 'Notes', 'type': 'string'},
        ],
        'system_defaults': {
            'instrument_type': 'MUTUAL_FUND',
            'balance': '0',
        },
    },
    'instruments': {
        'label': 'Instruments',
        'description': 'Initial setup of mutual funds, stocks, FDs, etc.',
        'required': [
            {'key': 'name', 'label': 'Name', 'type': 'string'},
            {'key': 'instrument_type', 'label': 'Instrument Type', 'type': 'choice',
             'choices': ['EQUITY', 'MUTUAL_FUND', 'SIP', 'FD', 'RD', 'EPF', 'PPF',
                         'NPS', 'REAL_ESTATE', 'GOLD', 'VEHICLE', 'LIABILITY',
                         'INSURANCE', 'OTHER']},
        ],
        'optional': [
            {'key': 'symbol', 'label': 'Symbol / ISIN', 'type': 'string'},
            {'key': 'default_account_name', 'label': 'Default Account', 'type': 'string'},
            {'key': 'owner_name', 'label': 'Owner Member', 'type': 'string'},
        ],
        'system_defaults': {},
    },
    'accounts': {
        'label': 'Accounts',
        'description': 'Bank accounts, credit cards, broker accounts',
        'required': [
            {'key': 'name', 'label': 'Account Name', 'type': 'string'},
            {'key': 'account_type', 'label': 'Account Type', 'type': 'choice',
             'choices': ['BANK', 'BROKER', 'PF', 'LOAN', 'CREDIT_CARD', 'INSURANCE', 'CASH', 'OTHER']},
            {'key': 'institution_name', 'label': 'Institution', 'type': 'string'},
        ],
        'optional': [
            {'key': 'opening_balance', 'label': 'Opening Balance', 'type': 'decimal'},
            {'key': 'credit_limit', 'label': 'Credit Limit', 'type': 'decimal'},
            {'key': 'statement_due_day', 'label': 'Statement Due Day', 'type': 'integer'},
            {'key': 'primary_member_name', 'label': 'Primary Member', 'type': 'string'},
        ],
        'system_defaults': {
            'opening_balance': '0',
        },
    },
    'members': {
        'label': 'Members',
        'description': 'Household members',
        'required': [
            {'key': 'full_name', 'label': 'Full Name', 'type': 'string'},
        ],
        'optional': [
            {'key': 'email', 'label': 'Email', 'type': 'string'},
            {'key': 'relation_type', 'label': 'Relation', 'type': 'choice',
             'choices': ['SELF', 'SPOUSE', 'CHILD', 'PARENT', 'OTHER']},
        ],
        'system_defaults': {
            'relation_type': 'OTHER',
            'email': '',
        },
    },
}
