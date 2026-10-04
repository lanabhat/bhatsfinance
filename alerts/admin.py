from django.contrib import admin

from alerts.models import RDMandate, SIPMandate

admin.site.register(SIPMandate)
admin.site.register(RDMandate)
