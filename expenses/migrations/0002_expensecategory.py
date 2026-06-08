import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0001_initial'),
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='ExpenseCategory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('key', models.SlugField(max_length=30)),
                ('label', models.CharField(max_length=50)),
                ('icon', models.CharField(max_length=10)),
                ('is_builtin', models.BooleanField(default=False)),
                ('household', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='expense_categories', to='core.household')),
            ],
            options={
                'ordering': ['label'],
                'unique_together': {('household', 'key')},
            },
        ),
    ]
