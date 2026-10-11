import type {DeliveryRoute, DeliveryStatus, School} from '../types';

export const DEFAULT_GEOFENCE_RADIUS_METERS = 200;

export const MOCK_ROUTE: DeliveryRoute = {
  id: 'route-001',
  name: 'Chennai morning school route',
  schoolIds: ['school-001', 'school-002', 'school-003'],
};

export const MOCK_SCHOOLS: School[] = [
  {
    id: 'school-001',
    name: 'Greenwood Public School',
    address: '12 Cathedral Road, Chennai',
    latitude: 13.0827,
    longitude: 80.2707,
    radiusMeters: DEFAULT_GEOFENCE_RADIUS_METERS,
    color: '#0F6E56',
    deliveryNote: 'Uniforms · 48 students',
  },
  {
    id: 'school-002',
    name: 'Harbour View High School',
    address: '88 Whannels Road, Chennai',
    latitude: 13.0875,
    longitude: 80.2707,
    radiusMeters: DEFAULT_GEOFENCE_RADIUS_METERS,
    color: '#185FA5',
    deliveryNote: 'Sports kits · 36 students',
  },
  {
    id: 'school-003',
    name: 'Marina Matriculation',
    address: '5 Santhome High Road, Chennai',
    latitude: 13.0827,
    longitude: 80.276,
    radiusMeters: DEFAULT_GEOFENCE_RADIUS_METERS,
    color: '#B54708',
    deliveryNote: 'Fitting appointments · 22 students',
  },
];

export function initialDeliveryStatuses(
  schools: School[] = MOCK_SCHOOLS,
): Record<string, DeliveryStatus> {
  return schools.reduce<Record<string, DeliveryStatus>>((statuses, school) => {
    statuses[school.id] = 'PENDING';
    return statuses;
  }, {});
}
