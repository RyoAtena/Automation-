# Firebase & Cloud Firestore Setup Guide — Nexus Arena

## 1. Architectural Overview: How PHP & Firebase Work Together Securely

### The Windows PHP + Cloud Firestore Technical Challenge
Google's official PHP Admin/Firestore SDK (`google/cloud-firestore`) depends on the C `grpc` PHP extension, which is often unavailable on standard Windows PHP installations and shared web hosts. Furthermore, connecting to a live Google Cloud Firestore instance requires an active Firebase project, billing/quota setup, and private Service Account credentials that cannot be bundled in a public repository.

### Our Dual-Adapter Solution (No Silent Replacement)
Instead of silently replacing Firebase, **Nexus Arena** implements a unified `FirestoreInterface` (`src/Database/FirestoreInterface.php`) backed by two interchangeable, schema-identical drivers:

1. **`FirebaseCloudAdapter` (`src/Database/FirebaseCloudAdapter.php`)**:
   - Uses PHP's native `curl` and `openssl` extensions (no `grpc` C extension required!).
   - Authenticates server-to-server using **OAuth2 Service Account JWT (`RS256`)** signed via `openssl_sign()` and exchanged at `https://oauth2.googleapis.com/token`.
   - Communicates directly with the **Cloud Firestore REST API v1** (`https://firestore.googleapis.com/v1/projects/{project_id}/databases/(default)/documents/...`) and **Firebase Authentication REST API** (`https://identitytoolkit.googleapis.com/v1/accounts:...`).
   - Encodes/decodes native Firestore typed field maps (`stringValue`, `integerValue`, `doubleValue`, `booleanValue`, `arrayValue`, `mapValue`).

2. **`LocalFirestoreAdapter` (`src/Database/LocalFirestoreAdapter.php`)**:
   - Used automatically when `DB_DRIVER=auto` and no external Firebase credentials are set in `.env` (or when `DB_DRIVER=local_firestore`).
   - Stores the exact same **18 Firestore collections** and document structures inside a local SQLite WAL database (`storage/firestore_local.sqlite`) with `BEGIN IMMEDIATE TRANSACTION` ACID locking and exports a human-readable JSON mirror (`storage/firestore_mirror.json`).
   - The top navigation bar and Admin Settings page transparently display which driver is currently active.

---

## 2. Step-by-Step Firebase Project Setup

1. **Create a Firebase Project**:
   - Go to [https://console.firebase.google.com/](https://console.firebase.google.com/) and click **Add project**.
   - Note your **Project ID** (e.g., `nexus-arena-prod`).

2. **Enable Firebase Authentication**:
   - In the Firebase Console, open **Build &rarr; Authentication &rarr; Sign-in method**.
   - Enable the **Email/Password** provider.
   - Open **Project Settings &rarr; General** and copy your **Web API Key** (`FIREBASE_API_KEY`).

3. **Create a Cloud Firestore Database**:
   - Open **Build &rarr; Firestore Database** and click **Create database**.
   - Select your preferred region and start in **Production mode**.
   - Deploy the security rules and composite indexes included in this repository:
     ```bash
     firebase deploy --only firestore:rules,firestore:indexes
     ```
     *(Or copy the contents of `firestore.rules` into the **Rules** tab in the Firebase Console).*

4. **Generate a Service Account Private Key (Server-Side Only)**:
   - Open **Project Settings &rarr; Service accounts**.
   - Click **Generate new private key** to download your JSON key file.
   - Save the file **outside** the `public/` folder (for example, `storage/firebase-service-account.json`) so it can never be downloaded over HTTP.

5. **Configure `.env`**:
   ```ini
   DB_DRIVER=firebase
   FIREBASE_PROJECT_ID=your-firebase-project-id
   FIREBASE_API_KEY=AIzaSyYourWebApiKeyHere
   FIREBASE_DATABASE_ID=(default)
   FIREBASE_SERVICE_ACCOUNT_PATH=storage/firebase-service-account.json
   ```

---

## 3. Firestore Collections & Schema Reference

All 18 collections used by the application:

| # | Collection Name | Document ID Example | Key Fields & Relationships |
|---|-----------------|---------------------|----------------------------|
| 1 | `users` | `usr_cust_1` | `name`, `email`, `phone`, `role` (`customer`\|`admin`), `status`, `password_hash` (bcrypt) |
| 2 | `rooms` | `room_101`, `room_201` | `room_number`, `name`, `type` (`regular`\|`vip`), `status` (`available`\|`occupied`\|`reserved`\|`maintenance`\|`unavailable`), `consoles[]`, `rate_per_hour`, `max_players`, `facilities[]`, `current_session_id` |
| 3 | `games` | `game_tekken8` | `title`, `genre`, `platform`, `cover_url`, `description`, `status`, `play_count` |
| 4 | `room_games` | `rg_room_101_game_tekken8` | `room_id` &rarr; `rooms.id`, `game_id` &rarr; `games.id`, `assigned_at` |
| 5 | `bookings` | `bk_demo_1` | `room_id`, `room_name`, `user_id`, `customer_name`, `booking_date`, `start_time`, `end_time`, `duration_hours`, `rate_per_hour`, `total_price`, `guests_count`, `status` (`pending`\|`confirmed`\|`cancelled`\|`completed`) |
| 6 | `queues` | `q_demo_1` | `user_id`, `customer_name`, `preferred_room_type`, `preferred_console`, `party_size`, `requested_hours`, `status` (`waiting`\|`notified`\|`assigned`\|`cancelled`), `position`, `notified_room_id` |
| 7 | `sessions` | `sess_demo_active_1` | `room_id`, `user_id`, `customer_name`, `game_id`, `controllers_assigned`, `start_timestamp`, `end_timestamp`, `start_time`, `scheduled_end_time`, `duration_hours`, `total_amount`, `status` (`active`\|`expired`\|`completed`\|`cancelled`) |
| 8 | `controllers` | `ctrl_room_101` | `room_id`, `room_name`, `console`, `total_controllers`, `available_controllers`, `in_use_controllers`, `maintenance_controllers` |
| 9 | `controller_requests` | `ctrl_req_...` | `user_id`, `customer_name`, `room_id`, `session_id`, `quantity`, `status` (`pending`\|`approved`\|`rejected`) |
| 10 | `menu_items` | `menu_burger` | `name`, `category`, `price`, `cost_price`, `stock`, `is_active`, `image_url`, `description` |
| 11 | `orders` | `ord_demo_1` | `user_id`, `customer_name`, `room_id`, `room_number`, `session_id`, `items[]`, `total_amount`, `status` (`Pending`\|`Accepted`\|`Preparing`\|`Ready`\|`Delivered`\|`Cancelled`), `stock_deducted` |
| 12 | `inventory_movements` | `inv_demo_1` | `item_id`, `item_name`, `change_qty`, `previous_stock`, `new_stock`, `reason`, `actor_id`, `created_at` |
| 13 | `transactions` | `tx_demo_1` | `type` (`rental`\|`fnb`), `reference_id`, `user_id`, `room_id`, `description`, `amount`, `payment_method`, `is_demo`, `transaction_date` |
| 14 | `expenses` | `exp_demo_1` | `category`, `description`, `amount`, `expense_date`, `recorded_by`, `is_demo` |
| 15 | `support_conversations` | `conv_demo_1` | `user_id`, `customer_name`, `session_id`, `room_number`, `status`, `unread_admin_count`, `unread_customer_count`, `last_message` |
| 16 | `support_messages` | `msg_demo_1` | `conversation_id`, `user_id`, `sender_id`, `sender_name`, `sender_role` (`customer`\|`admin`), `message`, `is_read`, `created_at` |
| 17 | `feedback` | `fb_demo_1` | `user_id`, `customer_display_name`, `session_id`, `room_id`, `rating` (1-5), `category` (`review`\|`complaint`\|`suggestion`), `comment`, `admin_response`, `allow_resubmit`, `is_public` |
| 18 | `notifications` | `notif_demo_1` | `user_id`, `role_target` (`customer`\|`admin`), `title`, `message`, `type`, `is_read` |
| + | `settings` | `business_config` | `business_name`, `regular_default_rate`, `vip_default_rate`, `allowed_durations_hours[]`, `opening_hours`, `low_stock_threshold`, `low_time_warning_minutes`, `admin_online` |
