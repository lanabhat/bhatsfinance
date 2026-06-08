from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('gmail_ingestion', '0003_googlecredential_multi'),
    ]

    operations = [
        migrations.AddField(
            model_name='gmailsyncconfig',
            name='excluded_recipients',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
