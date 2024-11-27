// ADM announcements: audience names shared by the composer and its history.
export type Audience = 'all_managers' | 'selected_branches' | 'customers' | 'city';
export const audienceLabels: Record<Audience, string> = {
  all_managers: 'All managers',
  selected_branches: 'Branches',
  customers: 'Customers',
  city: 'City',
};
