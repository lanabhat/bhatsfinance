from django.db import migrations, models


def backfill_approved(apps, schema_editor):
    GmailProcessedMessage = apps.get_model('gmail_ingestion', 'GmailProcessedMessage')
    GmailProcessedMessage.objects.filter(status='pending').update(status='approved')


class Migration(migrations.Migration):

    dependencies = [
        ('gmail_ingestion', '0006_excluded_senders'),
    ]

    operations = [
        migrations.AddField(
            model_name='gmailprocessedmessage',
            name='status',
            field=models.CharField(
                choices=[
                    ('pending', 'Pending'),
                    ('approved', 'Approved'),
                    ('rejected', 'Rejected'),
                    ('valuation_only', 'Valuation Only'),
                ],
                default='pending',
                max_length=20,
                db_index=True,
            ),
        ),
        migrations.AddField(
            model_name='gmailprocessedmessage',
            name='confidence',
            field=models.FloatField(null=True, blank=True),
        ),
        migrations.AddField(
            model_name='gmailprocessedmessage',
            name='template_key',
            field=models.CharField(blank=True, max_length=60),
        ),
        migrations.AddField(
            model_name='gmailprocessedmessage',
            name='suggestions',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.RunPython(backfill_approved, migrations.RunPython.noop),
    ]
