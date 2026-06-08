from django.contrib import admin

from ingestion.models import ImportBatch, ImportRow

admin.site.register(ImportBatch)
admin.site.register(ImportRow)
