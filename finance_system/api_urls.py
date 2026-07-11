from django.urls import path
from rest_framework.routers import DefaultRouter

from alerts.views import MissedRDAlertsView, MissedSIPAlertsView, RDMandateViewSet, SIPMandateViewSet
from insurance.views import InsurancePolicyViewSet, InsuranceSummaryView, MissedPremiumRemindersView, VehicleClaimViewSet
from core.views import CsrfView, HouseholdViewSet, IntegrationCredentialViewSet, MemberViewSet, UserAdminViewSet
from expenses.views import ExpenseCategoryViewSet, UnmappedExpensesView
from ingestion.views import CSVImportView, EpfPassbookApplyView, EpfPassbookPreviewView, FDAdviceApplyView, FDAdvicePreviewView, GrowwApplyView, GrowwPreviewView, ImportApplyView, ImportPreviewView, ImportSchemasView, NpsApplyView, NpsPreviewView
from insights.views import AllocationView, CategoryBreakdownView, CashFlowView, HoldingsHistoryView, HoldingsView, HouseholdAccountsView, MembersNetWorthView, NetWorthHistoryView, NetWorthView, SpendAnalyticsView, XIRRView
from reports.views import StatementExportView, StatementPreviewView
from instruments.views import (
    AccountBalanceView,
    AccountOwnershipViewSet,
    AccountViewSet,
    AssetCategoryViewSet,
    BulkDeleteInstrumentsView,
    FDDetailsViewSet,
    InstrumentOwnershipViewSet,
    InstrumentViewSet,
    MaturingFDsView,
)
from ledger.views import CashWithdrawalView, TagViewSet, TransactionViewSet
from gmail_ingestion.views import (
    GmailApproveProposalsView,
    GmailConfigView,
    GmailConnectCallbackView,
    GmailStagedBulkDeleteView,
    GmailConnectStartView,
    GmailDisconnectView,
    GmailFetchPreviewView,
    GmailImportGroupsView,
    GmailMessageFieldsView,
    GmailResetImportHistoryView,
    GmailStagedActionView,
    GmailStagedBulkApproveView,
    GmailStagedEditView,
    GmailStagedView,
    GmailStatusView,
    GmailSyncView,
    GmailTemplateDetailView,
    GmailTemplatesView,
)
from networth_tree.views import NetWorthTreeNodeCreateView, NetWorthTreeNodeDetailView, NetWorthTreeSeedView, NetWorthTreeView
from sms_ingestion.views import (
    SmsApiKeyViewSet,
    SmsIngestView,
    SmsMessageViewSet,
    SmsRuleViewSet,
    SmsRuleSuggestionViewSet,
    SmsStagedActionView,
    SmsStagedBalanceView,
    SmsStagedUpdateView,
)
from tax.views import TaxProjectionViewSet, TaxRecordViewSet
from upstox_integration.views import (
    UpstoxCallbackView,
    UpstoxConnectStartView,
    UpstoxDisconnectView,
    UpstoxStatusView,
    UpstoxSyncView,
    UpstoxUpdateMemberView,
)
from valuations.views import BulkSnapshotView, ValuationSnapshotViewSet

router = DefaultRouter()
router.register('households', HouseholdViewSet)
router.register('admin/users', UserAdminViewSet, basename='admin-users')
router.register('admin/integration-credentials', IntegrationCredentialViewSet, basename='admin-integration-credentials')
router.register('members', MemberViewSet)
router.register('accounts', AccountViewSet)
router.register('account-ownerships', AccountOwnershipViewSet, basename='account-ownership')
router.register('instruments', InstrumentViewSet)
router.register('instrument-ownerships', InstrumentOwnershipViewSet)
router.register('transactions', TransactionViewSet)
router.register('tags', TagViewSet, basename='tag')
router.register('valuations', ValuationSnapshotViewSet)
router.register('fd-details', FDDetailsViewSet)
router.register('asset-categories', AssetCategoryViewSet)
router.register('sip-mandates', SIPMandateViewSet)
router.register('rd-mandates', RDMandateViewSet)
router.register('insurance-policies', InsurancePolicyViewSet)
router.register('vehicle-claims', VehicleClaimViewSet)
router.register('tax-records', TaxRecordViewSet)
router.register('tax-projections', TaxProjectionViewSet)
router.register('expense-categories', ExpenseCategoryViewSet, basename='expense-category')
router.register('sms-api-keys', SmsApiKeyViewSet, basename='sms-api-key')
router.register('sms-messages', SmsMessageViewSet, basename='sms-message')
router.register('sms-rules', SmsRuleViewSet, basename='sms-rule')
router.register('sms-rule-suggestions', SmsRuleSuggestionViewSet, basename='sms-rule-suggestion')

urlpatterns = router.urls + [
    path('csrf/', CsrfView.as_view(), name='csrf'),
    path('holdings', HoldingsView.as_view(), name='holdings'),
    path('holdings/history', HoldingsHistoryView.as_view(), name='holdings-history'),
    path('household-accounts', HouseholdAccountsView.as_view(), name='household-accounts'),
    path('networth', NetWorthView.as_view(), name='networth'),
    path('networth/history', NetWorthHistoryView.as_view(), name='networth-history'),
    path('cashflow', CashFlowView.as_view(), name='cashflow'),
    path('spend-analytics', SpendAnalyticsView.as_view(), name='spend-analytics'),
    path('allocation', AllocationView.as_view(), name='allocation'),
    path('xirr', XIRRView.as_view(), name='xirr'),
    path('category-breakdown', CategoryBreakdownView.as_view(), name='category-breakdown'),
    path('members-networth', MembersNetWorthView.as_view(), name='members-networth'),
    path('alerts/missed-sip', MissedSIPAlertsView.as_view(), name='missed-sip-alerts'),
    path('alerts/missed-rd-installments', MissedRDAlertsView.as_view(), name='missed-rd-alerts'),
    path('alerts/missed-premiums', MissedPremiumRemindersView.as_view(), name='missed-premium-alerts'),
    path('insurance-summary', InsuranceSummaryView.as_view(), name='insurance-summary'),
    path('imports/csv', CSVImportView.as_view(), name='imports-csv'),
    path('imports/preview', ImportPreviewView.as_view(), name='imports-preview'),
    path('imports/schemas', ImportSchemasView.as_view(), name='imports-schemas'),
    path('imports/apply', ImportApplyView.as_view(), name='imports-apply'),
    path('imports/groww-preview', GrowwPreviewView.as_view(), name='imports-groww-preview'),
    path('imports/groww-apply', GrowwApplyView.as_view(), name='imports-groww-apply'),
    path('imports/fd-advice-preview', FDAdvicePreviewView.as_view(), name='imports-fd-advice-preview'),
    path('imports/fd-advice-apply', FDAdviceApplyView.as_view(), name='imports-fd-advice-apply'),
    path('imports/nps-preview', NpsPreviewView.as_view(), name='imports-nps-preview'),
    path('imports/nps-apply', NpsApplyView.as_view(), name='imports-nps-apply'),
    path('imports/epf-passbook-preview', EpfPassbookPreviewView.as_view(), name='imports-epf-passbook-preview'),
    path('imports/epf-passbook-apply', EpfPassbookApplyView.as_view(), name='imports-epf-passbook-apply'),
    path('reports/statement-preview', StatementPreviewView.as_view(), name='reports-statement-preview'),
    path('reports/statement-export', StatementExportView.as_view(), name='reports-statement-export'),
    path('valuations/bulk-snapshot', BulkSnapshotView.as_view(), name='bulk-snapshot'),
    path('accounts/<int:pk>/balance/', AccountBalanceView.as_view(), name='account-balance'),
    path('fd-details/maturing', MaturingFDsView.as_view(), name='fd-details-maturing'),
    path('instruments/bulk-delete', BulkDeleteInstrumentsView.as_view(), name='instruments-bulk-delete'),
    path('expense-categories/unmapped', UnmappedExpensesView.as_view(), name='expense-categories-unmapped'),
    path('cash-withdrawal/', CashWithdrawalView.as_view(), name='cash-withdrawal'),
    path('networth-tree/', NetWorthTreeView.as_view(), name='networth-tree'),
    path('networth-tree/seed', NetWorthTreeSeedView.as_view(), name='networth-tree-seed'),
    path('networth-tree/nodes', NetWorthTreeNodeCreateView.as_view(), name='networth-tree-node-create'),
    path('networth-tree/nodes/<int:pk>', NetWorthTreeNodeDetailView.as_view(), name='networth-tree-node-detail'),
    path('gmail/status', GmailStatusView.as_view(), name='gmail-status'),
    path('gmail/connect/start', GmailConnectStartView.as_view(), name='gmail-connect-start'),
    path('gmail/connect/callback', GmailConnectCallbackView.as_view(), name='gmail-connect-callback'),
    path('gmail/disconnect', GmailDisconnectView.as_view(), name='gmail-disconnect'),
    path('gmail/config', GmailConfigView.as_view(), name='gmail-config'),
    path('gmail/sync', GmailSyncView.as_view(), name='gmail-sync'),
    path('gmail/templates', GmailTemplatesView.as_view(), name='gmail-templates'),
    path('gmail/templates/<str:key>', GmailTemplateDetailView.as_view(), name='gmail-template-detail'),
    path('gmail/fetch-preview', GmailFetchPreviewView.as_view(), name='gmail-fetch-preview'),
    path('gmail/import-groups', GmailImportGroupsView.as_view(), name='gmail-import-groups'),
    path('gmail/approve-proposals', GmailApproveProposalsView.as_view(), name='gmail-approve-proposals'),
    path('gmail/message-fields', GmailMessageFieldsView.as_view(), name='gmail-message-fields'),
    path('gmail/reset-import-history', GmailResetImportHistoryView.as_view(), name='gmail-reset-import-history'),
    path('gmail/staged', GmailStagedView.as_view(), name='gmail-staged'),
    path('gmail/staged/bulk-approve', GmailStagedBulkApproveView.as_view(), name='gmail-staged-bulk-approve'),
    path('gmail/staged/bulk-delete', GmailStagedBulkDeleteView.as_view(), name='gmail-staged-bulk-delete'),
    path('gmail/staged/<int:pk>', GmailStagedEditView.as_view(), name='gmail-staged-edit'),
    path('gmail/staged/<int:pk>/approve', GmailStagedActionView.as_view(), {'action': 'approve'}, name='gmail-staged-approve'),
    path('gmail/staged/<int:pk>/reject', GmailStagedActionView.as_view(), {'action': 'reject'}, name='gmail-staged-reject'),
    path('upstox/status', UpstoxStatusView.as_view(), name='upstox-status'),
    path('upstox/connect', UpstoxConnectStartView.as_view(), name='upstox-connect-start'),
    path('upstox/callback', UpstoxCallbackView.as_view(), name='upstox-callback'),
    path('upstox/disconnect', UpstoxDisconnectView.as_view(), name='upstox-disconnect'),
    path('upstox/sync', UpstoxSyncView.as_view(), name='upstox-sync'),
    path('upstox/credentials/<int:pk>/member', UpstoxUpdateMemberView.as_view(), name='upstox-update-member'),
    path('sms/ingest', SmsIngestView.as_view(), name='sms-ingest'),
    path('sms-messages/<int:pk>/edit/', SmsStagedUpdateView.as_view(), name='sms-staged-edit'),
    path('sms-messages/<int:pk>/approve/', SmsStagedActionView.as_view(), {'action': 'approve'}, name='sms-staged-approve'),
    path('sms-messages/<int:pk>/reject/', SmsStagedActionView.as_view(), {'action': 'reject'}, name='sms-staged-reject'),
    path('sms-messages/<int:pk>/record-balance/', SmsStagedBalanceView.as_view(), name='sms-staged-balance'),
]
