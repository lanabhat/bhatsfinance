from django.contrib import admin

from core.models import Household, IntegrationCredential, Member

admin.site.register(Household)
admin.site.register(Member)
admin.site.register(IntegrationCredential)

# Register your models here.
