from django.contrib import admin

from tax.models import TaxProjection, TaxRecord

admin.site.register(TaxRecord)
admin.site.register(TaxProjection)
