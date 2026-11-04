export interface User {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: 'citizen' | 'collector' | 'recycler' | 'admin';
  account_type: 'household' | 'business' | null;
  organization: string | null;
  address: string | null;
  ward: string | null;
  lat: number | null;
  lng: number | null;
  green_credits: number;
  reliability: number;
  created_at: string;
}

export interface VehicleBrief {
  id: number;
  reg_no: string;
  name: string;
  cur_lat: number | null;
  cur_lng: number | null;
  last_seen: string | null;
}

export interface Pickup {
  id: number;
  user_id: number;
  waste_type: string;
  urgency: string;
  est_kg: number;
  actual_kg: number | null;
  lat: number;
  lng: number;
  address: string | null;
  notes: string | null;
  photo_url: string | null;
  proof_photo_url: string | null;
  status: string;
  priority_score: number;
  sla_deadline: string;
  route_id: number | null;
  credits_awarded: number;
  skip_reason: string | null;
  created_at: string;
  scheduled_at: string | null;
  collected_at: string | null;
  requester_name?: string | null;
  requester_phone?: string | null;
  vehicle?: VehicleBrief | null;
  stops_before?: number | null;
  eta?: string | null;
}

export interface Vehicle extends VehicleBrief {
  capacity_kg: number;
  allowed_types: string;
  depot_lat: number;
  depot_lng: number;
  driver_id: number | null;
  status: string;
  driver_name: string | null;
}

export interface Stop {
  id: number;
  seq: number;
  status: 'pending' | 'done' | 'skipped';
  eta: string | null;
  leg_km: number;
  completed_at: string | null;
  request: Pickup;
}

export interface Route {
  id: number;
  vehicle_id: number;
  status: 'planned' | 'active' | 'completed';
  planner: string;
  total_km: number;
  total_kg: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  vehicle: Vehicle;
  stops: Stop[];
}

export interface Lot {
  id: number;
  request_id: number;
  material: string;
  kg: number;
  price_per_kg: number;
  ward: string | null;
  lat: number;
  lng: number;
  photo_url: string | null;
  status: 'available' | 'claimed' | 'picked';
  recycler_id: number | null;
  created_at: string;
  claimed_at: string | null;
  picked_at: string | null;
  distance_km: number | null;
  total_value: number;
}
