from django.contrib import admin

from instruments.models import Account, AccountOwnership, Instrument, InstrumentOwnership

admin.site.register(Account)
admin.site.register(AccountOwnership)
admin.site.register(Instrument)
admin.site.register(InstrumentOwnership)

# Register your models here.
