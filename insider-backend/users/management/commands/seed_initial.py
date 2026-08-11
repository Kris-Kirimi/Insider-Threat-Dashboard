"""Seed the reference data the authorization layer depends on.

Departments and roles are *not* demo data: Role.level is what the permission
layer compares against (manager-grade actions need level >= 3), so without
seeded levels every role sits at the default and those checks can never pass.
The frontend also addresses departments by a fixed id.

No superuser is created here -- use `manage.py createsuperuser`, which keeps
credentials out of source control. Sample accounts and files live behind
--demo so they can never be created against real data.
"""
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from users.models import AccessControl, Department, Resource, Role

User = get_user_model()

# Order matters: the frontend hardcodes Finance=1, IT=2.
DEPARTMENTS = ['Finance', 'IT', 'HR', 'Operations']

# Level drives in-department privilege. See users/permissions.py.
ROLE_LEVELS = {
    'System Admin': 4,
    'Manager': 3,
    'Analyst': 2,
    'Employee': 1,
}

DEMO_PASSWORD = 'DemoPass123!'
DEMO_USERS = [
    # email, full name, department, role
    ('finance.employee@insider.local', 'Fiona Mwangi', 'Finance', 'Employee'),
    ('finance.manager@insider.local', 'Grace Otieno', 'Finance', 'Manager'),
    ('it.employee@insider.local', 'Ian Kamau', 'IT', 'Employee'),
]


class Command(BaseCommand):
    help = 'Seed departments and roles (required). Use --demo for sample accounts and files.'

    def add_arguments(self, parser):
        parser.add_argument('--demo', action='store_true',
                            help='Also create sample employees, files and an access rule.')

    @transaction.atomic
    def handle(self, *args, **options):
        for name in DEPARTMENTS:
            Department.objects.get_or_create(name=name)
        self.stdout.write(self.style.SUCCESS(f'Departments ensured: {", ".join(DEPARTMENTS)}'))

        # Role.department is non-nullable and ('name', 'department') is unique,
        # so every role is created per department. The previous version called
        # get_or_create(name=...) with no department and raised IntegrityError
        # before reaching anything else.
        role_count = 0
        for department in Department.objects.all():
            for role_name, level in ROLE_LEVELS.items():
                Role.objects.update_or_create(
                    name=role_name, department=department,
                    defaults={'level': level},
                )
                role_count += 1
        self.stdout.write(self.style.SUCCESS(
            f'Roles ensured: {role_count} ({", ".join(f"{n}={l}" for n, l in ROLE_LEVELS.items())})'
        ))

        if options['demo']:
            self._seed_demo()
        else:
            self.stdout.write(
                '\nNext: create an administrator with `python manage.py createsuperuser`.\n'
                'For a demo dataset, re-run with --demo.'
            )

    def _seed_demo(self):
        if not settings.DEBUG:
            raise CommandError('Refusing to seed demo data with DEBUG=False.')

        created_users = []
        for email, full_name, dept_name, role_name in DEMO_USERS:
            department = Department.objects.get(name=dept_name)
            role = Role.objects.get(name=role_name, department=department)
            user, created = User.objects.get_or_create(
                email=email,
                defaults={'full_name': full_name, 'department': department, 'role': role},
            )
            if created:
                user.set_password(DEMO_PASSWORD)
                user.department = department
                user.role = role
                user.save()
                created_users.append(email)

        # One resource per department, with real bytes so downloads work.
        for dept_name, filename, body in (
            ('Finance', 'q4-forecast.txt', 'Confidential Q4 revenue forecast.'),
            ('IT', 'network-diagram.txt', 'Internal network topology notes.'),
        ):
            department = Department.objects.get(name=dept_name)
            owner = User.objects.filter(department=department).first()
            if Resource.objects.filter(name=filename, department=department).exists():
                continue
            path = default_storage.save(f'resources/{filename}', ContentFile(body.encode()))
            resource = Resource.objects.create(
                name=filename, path=path, department=department, created_by=owner,
            )
            if owner:
                AccessControl.objects.get_or_create(
                    user=owner, resource=resource, defaults={'permission': 'full_control'},
                )

        # An explicit revocation, so the deny-wins rule is visible in the UI:
        # this user is in Finance but still cannot open the Finance file.
        finance_file = Resource.objects.filter(name='q4-forecast.txt').first()
        it_employee = User.objects.filter(email='it.employee@insider.local').first()
        if finance_file and it_employee:
            AccessControl.objects.get_or_create(
                user=it_employee, resource=finance_file, defaults={'permission': 'none'},
            )

        self.stdout.write(self.style.SUCCESS(
            f'\nDemo data seeded. New accounts: {", ".join(created_users) or "none (already existed)"}'
        ))
        self.stdout.write(f'Demo password for all sample accounts: {DEMO_PASSWORD}')
        self.stdout.write(
            'Try: python manage.py simulate_threat '
            '--user finance.employee@insider.local --scenario all --run-detections'
        )
