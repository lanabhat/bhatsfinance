# Generated manually (no makemigrations dependency in this environment).
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ('core', '0002_userprofile'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='GoogleCredential',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('refresh_token', models.TextField(blank=True)),
                ('access_token', models.TextField(blank=True)),
                ('expires_at', models.DateTimeField(blank=True, null=True)),
                ('scope', models.TextField(blank=True)),
                ('token_type', models.CharField(blank=True, max_length=50)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='google_credential', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='GmailSyncConfig',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('query_override', models.TextField(blank=True)),
                ('account_rules', models.JSONField(blank=True, default=list)),
                ('last_synced_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('household', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='gmail_sync_configs', to='core.household')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='gmail_sync_configs', to=settings.AUTH_USER_MODEL)),
            ],
            options={'unique_together': {('user', 'household')}},
        ),
        migrations.CreateModel(
            name='GmailProcessedMessage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('message_id', models.CharField(max_length=200)),
                ('thread_id', models.CharField(blank=True, max_length=200)),
                ('internal_date_ms', models.BigIntegerField(blank=True, null=True)),
                ('imported_transaction_id', models.IntegerField(blank=True, null=True)),
                ('imported_valuation_id', models.IntegerField(blank=True, null=True)),
                ('raw', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('household', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='gmail_processed_messages', to='core.household')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='gmail_processed_messages', to=settings.AUTH_USER_MODEL)),
            ],
            options={'unique_together': {('user', 'household', 'message_id')}},
        ),
        migrations.AddIndex(
            model_name='gmailprocessedmessage',
            index=models.Index(fields=['user', 'household', 'message_id'], name='gmail_ingest_user_id_5b2f7d_idx'),
        ),
    ]

