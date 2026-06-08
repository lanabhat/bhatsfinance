from django.contrib import admin

from sms_ingestion.models import SmsApiKey, SmsMessage


@admin.register(SmsApiKey)
class SmsApiKeyAdmin(admin.ModelAdmin):
    list_display = ['label', 'household', 'token', 'is_active', 'last_used_at', 'created_at']
    list_filter = ['household', 'is_active']
    readonly_fields = ['token', 'last_used_at', 'created_at', 'updated_at']


@admin.register(SmsMessage)
class SmsMessageAdmin(admin.ModelAdmin):
    list_display = ['sender', 'household', 'owner', 'received_at', 'status', 'imported_transaction_id']
    list_filter = ['household', 'status']
    search_fields = ['sender', 'body']
    readonly_fields = ['raw_payload', 'created_at', 'updated_at']
