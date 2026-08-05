# Customer Mobile App

Hexaone single-salon customer app (Flutter): phone OTP login, book appointments, view history/rebook, loyalty profile, and in-app offers from salon admin.

## Requirements

- Flutter SDK compatible with `sdk: ^3.10.4`
- Backend with `/api/public` booking + customer-portal APIs
- A numeric salon **Tenant ID** (from Branding / admin settings)

## Run

```bash
cd customer_mobile_app
flutter pub get
flutter run
```

Default tenant is **28**. Override if needed:

```bash
flutter run --dart-define=API_BASE_URL=https://api.salon.hexalyte.com --dart-define=TENANT_ID=28
```

Optional brand label:

```bash
flutter run --dart-define=BRAND_NAME=Hexaone
```

Local backend example:

```bash
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000 --dart-define=TENANT_ID=28
```


(`10.0.2.2` is the Android emulator host loopback.)

## Features

| Tab | Access | Notes |
|-----|--------|--------|
| Book | Guest OK | All active services → staff → slot → confirm (+ booking OTP for new phones) |
| Appointments | Login | History + rebook |
| Offers | Guest OK | Published mobile offers for this tenant |
| Profile | Login | Name, phone, loyalty points |

## Admin offers

Salon admins/managers create offers in the web app under **Engage → Mobile Offers**. Published offers appear on the Offers tab via `GET /api/public/offers?tenantId=`.

## Notes

- `TENANT_ID` is required; the app shows a setup screen if it is missing.
- Push notifications are not included in this MVP.
