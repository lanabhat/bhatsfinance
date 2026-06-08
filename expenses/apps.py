from django.apps import AppConfig


def _seed_builtin_categories(sender, instance, created, **kwargs):
    if not created:
        return
    from expenses.models import BUILTIN_CATEGORIES, ExpenseCategory
    for key, label, icon in BUILTIN_CATEGORIES:
        ExpenseCategory.objects.get_or_create(
            household=instance, key=key,
            defaults={'label': label, 'icon': icon, 'is_builtin': True},
        )


class ExpensesConfig(AppConfig):
    name = 'expenses'

    def ready(self):
        from django.db.models.signals import post_save
        from core.models import Household
        post_save.connect(_seed_builtin_categories, sender=Household, weak=False)
