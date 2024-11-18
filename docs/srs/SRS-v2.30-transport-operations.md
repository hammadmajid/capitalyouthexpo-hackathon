# SRS v2.30 — Transport operations

CHG-042 supplements SERV-002 and RENT-004. Transport remains optional in Amenities & Services. Skipping it does not block listing submission or verification. Inactive routes are private drafts. Publication requires at least one departure and a destination or stop. The public branch must also meet the existing marketplace publication rules.

A branch may offer distinct routes with university, workplace, area and custom destinations. Catalog records retain their canonical names. Stops are marked as pickup, drop-off or both. Routes may contain multiple weekly trips, with explicit effective dates, activation, return journeys and next-day offsets in Asia/Karachi. A one-way trip can omit the return. Arrival times appear only when configured.

Included-in-rent routes must be captured in the accepted booking quote and its resulting Stay agreement. An effective date alone grants no entitlement. A captured route remains included for that agreement after a subsequent price change. Existing agreements without a capture, including direct admissions, gain no automatic entitlement. Included routes create no subscription or incremental charge.

The CHG-043 correction sets one optional subscription per Stay at its branch. All routes share the branch's disclosed monthly fee and one approval. Route choice only affects travel. Pricing edits affect new requests. Existing subscriptions retain their accepted amount. Non-overlapping historical windows use the existing transport billing schedule and proration rules. Invoiced periods remain immutable.

Owners operate their own branches. Managers need live branch grants for route edits (`listing_edit`, `pricing_edit`), subscription decisions (`stay_manage`, `rent_manage`) and management reads of subscription amounts (`finance_view`). Residents can act only on their own checked-in, operational Stay. Marketplace Transport contains route and schedule information only.
