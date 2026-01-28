import React, { useState, useEffect, useCallback } from 'react';
import { useProperty } from '../context/PropertyContext';
import { propertyAPI } from '../services/api';
import UnitManagement from './UnitManagement';
import { toast, Toaster } from 'react-hot-toast';
import { 
  Building, MapPin, Users, Home, Edit, Trash2, 
  Image as ImageIcon, Plus, X, Search, 
  Percent, AlertCircle, CheckCircle,
  LayoutGrid, ArrowRight, Loader2,
  DollarSign, Activity, Calendar, Eye, 
  ChevronDown, ChevronUp, FileText, Building2,
  Wallet, MessageSquare, AlertTriangle, User
} from 'lucide-react';

// --- Helper Components ---

const StatBadge = ({ icon: Icon, label, value, subValue, colorClass = "text-gray-600 bg-gray-50" }) => (
  <div className={`flex items-start space-x-3 px-3 py-2.5 rounded-lg ${colorClass} border border-transparent hover:border-gray-200 transition-colors w-full`}>
    <div className="mt-0.5 p-1.5 bg-white/60 rounded-md backdrop-blur-sm">
      <Icon className="w-4 h-4" />
    </div>
    <div className="flex flex-col min-w-0">
      <span className="text-[10px] uppercase tracking-wider font-bold opacity-70 leading-none mb-1">{label}</span>
      <span className="text-sm font-extrabold truncate">{value}</span>
      {subValue && <span className="text-[10px] opacity-80 font-medium">{subValue}</span>}
    </div>
  </div>
);

const PropertyCard = ({ property, onManageUnits, onEdit, onDelete, onViewDetails, onOpenGallery, isExpanded, onToggleExpand }) => {
  const [occupancyRate, setOccupancyRate] = useState(0);
  const [occupiedUnits, setOccupiedUnits] = useState(0);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  
  // Slide show logic
  useEffect(() => {
    if (property.images && property.images.length > 1) {
      const interval = setInterval(() => {
        setCurrentImageIndex(prev => (prev + 1) % property.images.length);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [property.images]);

  // Metrics Calculation
  const expectedRent = property.stats?.expected_rent || property.total_units * 15000; // Fallback or from stats
  const collectedRent = property.stats?.collected_this_month || 0;
  const arrearsCount = property.stats?.arrears_count || 0;
  const imageCount = property.images?.length || 0;

  useEffect(() => {
    if (property.total_units > 0) {
      const occupied = property.occupied_units || (property.total_units - property.available_units);
      setOccupiedUnits(occupied);
      setOccupancyRate(Math.round((occupied / property.total_units) * 100));
    } else {
      setOccupiedUnits(0);
      setOccupancyRate(0);
    }
  }, [property]);

  const getOccupancyColor = (rate) => {
    if (rate >= 90) return 'text-green-700 bg-green-50 border-green-100';
    if (rate >= 70) return 'text-yellow-700 bg-yellow-50 border-yellow-100';
    return 'text-red-700 bg-red-50 border-red-100';
  };

  const activeImage = property.images && property.images.length > 0 
    ? property.images[currentImageIndex]?.image_url 
    : null;

  return (
    <div className={`group bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 overflow-hidden flex flex-col ${isExpanded ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}>
      {/* Top Banner / Image Area with Slideshow */}
      <div className="h-44 relative overflow-hidden bg-slate-900">
        {activeImage ? (
          <div className="absolute inset-0 transition-opacity duration-1000 ease-in-out">
             <img 
               src={activeImage} 
               alt={property.name} 
               className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-700"
             />
             <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent"></div>
          </div>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900">
            <div className="absolute inset-0 opacity-30 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] mix-blend-overlay"></div>
            {/* Abstract Shapes */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2"></div>
          </div>
        )}
        
        <div className="absolute top-4 right-4 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-white border border-white/30 shadow-sm z-10 flex items-center gap-1">
          <Building2 className="w-3 h-3" />
          {property.property_code}
        </div>
        
        {/* Property Title Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
          <h3 className="text-xl font-bold text-white line-clamp-1 group-hover:text-blue-200 transition-colors drop-shadow-md">
            {property.name}
          </h3>
          <div className="flex items-center text-gray-300 text-xs mt-1 font-medium">
            <MapPin className="w-3 h-3 mr-1 text-blue-400" />
            <span className="line-clamp-1">{property.town}, {property.county}</span>
          </div>
        </div>

        {/* Quick Actions Overlay (Hover) */}
        <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center gap-3 backdrop-blur-sm z-20">
          <button 
            onClick={() => onViewDetails(property)}
            className="flex flex-col items-center justify-center w-10 h-10 bg-white hover:bg-blue-50 text-slate-700 rounded-lg transition-all duration-200 hover:scale-110 shadow-lg"
            title="View Details"
          >
            <Eye className="w-5 h-5" />
          </button>
          <button 
            onClick={() => onOpenGallery(property)}
            className="flex flex-col items-center justify-center w-10 h-10 bg-white hover:bg-purple-50 text-slate-700 rounded-lg transition-all duration-200 hover:scale-110 shadow-lg"
            title="Gallery"
          >
            <ImageIcon className="w-5 h-5" />
          </button>
          <button 
            onClick={() => onEdit(property)}
            className="flex flex-col items-center justify-center w-10 h-10 bg-white hover:bg-green-50 text-slate-700 rounded-lg transition-all duration-200 hover:scale-110 shadow-lg"
            title="Edit Property"
          >
            <Edit className="w-5 h-5" />
          </button>
          <button 
            onClick={() => onDelete(property.id)}
            className="flex flex-col items-center justify-center w-10 h-10 bg-white hover:bg-red-50 text-slate-700 rounded-lg transition-all duration-200 hover:scale-110 shadow-lg"
            title="Delete Property"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex-1 flex flex-col">
        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <StatBadge 
            icon={DollarSign} 
            label="Expected Rent" 
            value={`Ksh ${expectedRent.toLocaleString()}`} 
            colorClass="bg-blue-50/50 text-blue-700"
          />
          <StatBadge 
            icon={Wallet} 
            label="Collected" 
            value={`Ksh ${collectedRent.toLocaleString()}`}
            colorClass="bg-emerald-50/50 text-emerald-700"
          />
          <StatBadge 
            icon={AlertCircle} 
            label="Arrears" 
            value={arrearsCount}
            subValue="Tenants"
            colorClass="bg-red-50/50 text-red-700"
          />
          <div className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg border ${getOccupancyColor(occupancyRate)}`}>
            <div className="p-1.5 bg-white/60 rounded-md backdrop-blur-sm">
              <Percent className="w-4 h-4" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-[10px] uppercase tracking-wider font-bold opacity-70 mb-1">Occupancy</span>
              <span className="text-sm font-extrabold">{occupancyRate}%</span>
            </div>
          </div>
        </div>

        {/* Secondary Info */}
        <div className="flex justify-between items-center text-xs text-gray-500 mb-4 px-1">
           <div className="flex items-center gap-1.5">
             <ImageIcon className="w-3.5 h-3.5" />
             <span>{imageCount} Images</span>
           </div>
           <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <Home className="w-3.5 h-3.5" />
              <span>{property.total_units} Units</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5 text-green-500" />
              <span>{property.available_units} Vacant</span>
            </div>
           </div>
        </div>

        {/* Footer Action - Inline Expansion */}
        <div className="mt-auto">
          <button
            onClick={() => onToggleExpand(property.id)}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 border ${
              isExpanded 
                ? 'bg-slate-800 text-white border-slate-800 shadow-md' 
                : 'bg-gray-50 hover:bg-white text-gray-700 hover:text-blue-600 border-gray-100 hover:border-blue-100 hover:shadow-sm'
            }`}
          >
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-4 h-4" />
              <span className="font-medium text-sm">Manage Units</span>
            </div>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Inline Unit Management */}
      {isExpanded && (
        <div className="border-t border-gray-100 bg-gray-50/50 p-4 animate-in slide-in-from-top-2 duration-200">
           <UnitManagement property={property} />
        </div>
      )}
    </div>
  );
};

const PropertyDetailsModal = ({ property, onClose, onOpenGallery }) => {
  const [activeTab, setActiveTab] = useState('info');
  const [units, setUnits] = useState([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [activity, setActivity] = useState([]);

  useEffect(() => {
    if (activeTab === 'units') {
      fetchUnits();
    }
    if (activeTab === 'activity') {
      fetchActivity();
    }
  }, [activeTab]);

  const fetchUnits = async () => {
    setLoadingUnits(true);
    try {
      const res = await propertyAPI.getUnits(property.id);
      if (res.data.success) {
        setUnits(res.data.data);
      }
    } catch (err) {
      toast.error("Failed to load unit list");
    } finally {
      setLoadingUnits(false);
    }
  };

  const fetchActivity = () => {
    // Mock activity fetch - replace with real API call
    setActivity([
      { id: 1, type: 'payment', title: 'Rent Payment', desc: 'Unit 101 paid Ksh 15,000', date: 'Today, 10:30 AM', amount: 15000 },
      { id: 2, type: 'complaint', title: 'Leaking Tap', desc: 'Unit 204 reported maintenance issue', date: 'Yesterday', status: 'Pending' },
      { id: 3, type: 'payment', title: 'Water Bill', desc: 'Unit 105 paid Ksh 500', date: '2 days ago', amount: 500 },
      { id: 4, type: 'payment', title: 'Rent Payment', desc: 'Unit 301 paid Ksh 12,000', date: '3 days ago', amount: 12000 },
      { id: 5, type: 'complaint', title: 'Security Light', desc: 'Corridor light fixed', date: 'Last week', status: 'Resolved' },
    ]);
  };

  if (!property) return null;

  const tabs = [
    { id: 'info', label: 'Overview', icon: FileText },
    { id: 'units', label: 'Unit List', icon: LayoutGrid },
    { id: 'financials', label: 'Financials', icon: DollarSign },
    { id: 'activity', label: 'Recent Activity', icon: Activity },
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6">
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-gray-100 bg-white">
          <div className="flex gap-4">
             <div className="w-16 h-16 bg-blue-50 rounded-lg flex items-center justify-center border border-blue-100">
               {property.images && property.images.length > 0 ? (
                 <img src={property.images[0].image_url} alt="" className="w-full h-full object-cover rounded-lg" />
               ) : (
                 <Building className="w-8 h-8 text-blue-500" />
               )}
             </div>
             <div>
              <h2 className="text-2xl font-bold text-gray-900">{property.name}</h2>
              <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                <span className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded text-gray-700 font-medium">
                  {property.property_code}
                </span>
                <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {property.address}, {property.town}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => onOpenGallery(property)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg transition-colors font-medium text-sm"
            >
              <ImageIcon className="w-4 h-4" />
              Gallery
            </button>
            <button 
              onClick={onClose}
              className="p-2 bg-gray-50 hover:bg-gray-100 rounded-full transition-colors text-gray-500 hover:text-gray-700"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-8 bg-gray-50/50">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-all ${
                activeTab === tab.id 
                  ? 'border-blue-600 text-blue-600 bg-white' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 bg-gray-50/30">
          {activeTab === 'info' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Property Details</h3>
                  <dl className="space-y-4">
                    <div className="flex justify-between py-3 border-b border-gray-50">
                      <dt className="text-gray-500 text-sm">Description</dt>
                      <dd className="text-gray-900 text-sm font-medium text-right max-w-xs">{property.description || 'No description provided'}</dd>
                    </div>
                    <div className="flex justify-between py-3 border-b border-gray-50">
                      <dt className="text-gray-500 text-sm">Location</dt>
                      <dd className="text-gray-900 text-sm font-medium">{property.town}, {property.county}</dd>
                    </div>
                    <div className="flex justify-between py-3 border-b border-gray-50">
                      <dt className="text-gray-500 text-sm">Created At</dt>
                      <dd className="text-gray-900 text-sm font-medium">{new Date(property.created_at || Date.now()).toLocaleDateString()}</dd>
                    </div>
                    <div className="flex justify-between py-3 border-b border-gray-50">
                      <dt className="text-gray-500 text-sm">Total Capacity</dt>
                      <dd className="text-gray-900 text-sm font-medium">{property.total_units} Units</dd>
                    </div>
                  </dl>
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm h-fit">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Quick Stats</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                    <div className="text-blue-600 text-sm font-medium mb-1 flex items-center gap-1">
                      <Percent className="w-4 h-4" /> Occupancy
                    </div>
                    <div className="text-2xl font-bold text-blue-900">
                      {property.total_units ? Math.round(((property.total_units - property.available_units) / property.total_units) * 100) : 0}%
                    </div>
                  </div>
                  <div className="p-4 bg-green-50 rounded-xl border border-green-100">
                    <div className="text-green-600 text-sm font-medium mb-1 flex items-center gap-1">
                      <CheckCircle className="w-4 h-4" /> Available
                    </div>
                    <div className="text-2xl font-bold text-green-900">
                      {property.available_units} Units
                    </div>
                  </div>
                  <div className="p-4 bg-purple-50 rounded-xl border border-purple-100 col-span-2">
                    <div className="text-purple-600 text-sm font-medium mb-1 flex items-center gap-1">
                      <DollarSign className="w-4 h-4" /> Est. Monthly Revenue
                    </div>
                    <div className="text-2xl font-bold text-purple-900">
                       Ksh {(property.stats?.expected_rent || 0).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'units' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
               <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                 <h3 className="font-bold text-gray-900">Unit List</h3>
                 <span className="text-xs text-gray-500">{units.length} units found</span>
               </div>
               
               {loadingUnits ? (
                 <div className="p-12 flex justify-center">
                   <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                 </div>
               ) : (
                 <div className="overflow-x-auto">
                   <table className="w-full text-sm text-left">
                     <thead className="bg-gray-50 text-gray-500 font-medium">
                       <tr>
                         <th className="px-6 py-3">Unit Code</th>
                         <th className="px-6 py-3">Type</th>
                         <th className="px-6 py-3">Rent Amount</th>
                         <th className="px-6 py-3">Status</th>
                         <th className="px-6 py-3">Tenant</th>
                         <th className="px-6 py-3 text-right">Arrears</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-100">
                       {units.map((unit) => (
                         <tr key={unit.id} className="hover:bg-blue-50/30 transition-colors">
                           <td className="px-6 py-3 font-medium text-gray-900">{unit.unit_code}</td>
                           <td className="px-6 py-3 capitalize text-gray-600">{(unit.unit_type || '').replace('_', ' ')}</td>
                           <td className="px-6 py-3 font-medium">Ksh {parseInt(unit.rent_amount).toLocaleString()}</td>
                           <td className="px-6 py-3">
                             <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                               unit.is_occupied 
                                 ? 'bg-blue-100 text-blue-700' 
                                 : 'bg-green-100 text-green-700'
                             }`}>
                               {unit.is_occupied ? 'Occupied' : 'Vacant'}
                             </span>
                           </td>
                           <td className="px-6 py-3 text-gray-600">
                             {unit.tenant ? (
                               <div className="flex items-center gap-1">
                                 <User className="w-3 h-3" />
                                 {unit.tenant.tenant_name}
                               </div>
                             ) : '-'}
                           </td>
                           <td className="px-6 py-3 text-right">
                             {unit.arrears > 0 ? (
                               <span className="text-red-600 font-medium">Ksh {unit.arrears.toLocaleString()}</span>
                             ) : (
                               <span className="text-green-600">-</span>
                             )}
                           </td>
                         </tr>
                       ))}
                       {units.length === 0 && (
                         <tr>
                           <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                             No units found for this property.
                           </td>
                         </tr>
                       )}
                     </tbody>
                   </table>
                 </div>
               )}
            </div>
          )}

          {activeTab === 'financials' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                   <div className="text-gray-500 text-sm font-medium mb-1">Total Collected (Month)</div>
                   <div className="text-3xl font-bold text-gray-900">Ksh {(property.stats?.collected_this_month || 0).toLocaleString()}</div>
                 </div>
                 <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                   <div className="text-gray-500 text-sm font-medium mb-1">Expected Monthly Rent</div>
                   <div className="text-3xl font-bold text-gray-900">Ksh {(property.stats?.expected_rent || 0).toLocaleString()}</div>
                 </div>
                 <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                   <div className="text-gray-500 text-sm font-medium mb-1">Total Arrears</div>
                   <div className="text-3xl font-bold text-red-600">Ksh {(property.stats?.total_arrears || 0).toLocaleString()}</div>
                 </div>
              </div>
              
              <div className="flex flex-col items-center justify-center py-12 text-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                <div className="bg-white p-4 rounded-full mb-4 shadow-sm">
                  <Activity className="w-8 h-8 text-blue-500" />
                </div>
                <h3 className="text-lg font-medium text-gray-900">Detailed Reports</h3>
                <p className="text-gray-500 max-w-sm mt-2">
                  Full financial breakdown, trend analysis, and export options will be available here.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="space-y-6">
               <h3 className="text-lg font-bold text-gray-900">Last 5 Activities</h3>
               <div className="space-y-3">
                 {activity.map((item) => (
                   <div key={item.id} className="flex items-start gap-4 p-4 bg-white rounded-xl border border-gray-100 hover:shadow-md transition-shadow">
                     <div className={`p-3 rounded-full mt-1 ${
                       item.type === 'payment' ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'
                     }`}>
                       {item.type === 'payment' ? <DollarSign className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                     </div>
                     <div className="flex-1">
                       <div className="flex justify-between items-start">
                         <h4 className="font-semibold text-gray-900">{item.title}</h4>
                         <span className="text-xs text-gray-400 font-medium">{item.date}</span>
                       </div>
                       <p className="text-sm text-gray-600 mt-1">{item.desc}</p>
                       {item.amount && (
                         <div className="mt-2 inline-block px-2 py-1 bg-green-50 text-green-700 text-xs font-bold rounded">
                           + Ksh {item.amount.toLocaleString()}
                         </div>
                       )}
                       {item.status && (
                         <div className="mt-2 inline-block px-2 py-1 bg-orange-50 text-orange-700 text-xs font-bold rounded capitalize">
                           {item.status}
                         </div>
                       )}
                     </div>
                   </div>
                 ))}
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


// Image Gallery Modal
const ImageGalleryModal = ({ property, onClose }) => {
  const [images, setImages] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    fetchImages();
  }, [property]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, images.length]);

  const fetchImages = async () => {
    setLoading(true);
    try {
      const res = await propertyAPI.getPropertyImages(property.id);
      if (res.data.success) {
        setImages(res.data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files.length) return;
    
    setIsUploading(true);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('property_images', files[i]);
    }

    try {
      await propertyAPI.uploadPropertyImages(property.id, formData);
      toast.success('Images uploaded successfully');
      fetchImages();
    } catch (err) {
      toast.error('Failed to upload images');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (imageId) => {
    if (!confirm('Delete this image?')) return;
    try {
      await propertyAPI.deletePropertyImage(property.id, imageId);
      toast.success('Image deleted');
      setImages(prev => prev.filter(img => img.id !== imageId));
      if (currentIndex >= images.length - 1) setCurrentIndex(Math.max(0, images.length - 2));
    } catch (err) {
      toast.error('Failed to delete image');
    }
  };

  const handleNext = () => setCurrentIndex(prev => (prev + 1) % images.length);
  const handlePrev = () => setCurrentIndex(prev => (prev - 1 + images.length) % images.length);

  return (
    <div className="fixed inset-0 z-[80] bg-black/95 flex flex-col animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex justify-between items-center p-4 text-white bg-black/50 backdrop-blur-md">
         <div>
           <h3 className="text-lg font-bold">{property.name}</h3>
           <p className="text-xs text-gray-400">{images.length} Photos</p>
         </div>
         <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors">
           <X className="w-6 h-6" />
         </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden">
        {loading ? (
          <Loader2 className="w-10 h-10 text-white animate-spin" />
        ) : images.length > 0 ? (
          <>
            <img 
              src={images[currentIndex]?.image_url} 
              className="max-h-full max-w-full object-contain transition-all duration-300"
              alt="Gallery"
            />
            
            {/* Nav Buttons */}
            <button onClick={handlePrev} className="absolute left-4 p-3 bg-black/50 hover:bg-white/20 text-white rounded-full backdrop-blur-sm transition-all">
              <ArrowRight className="w-6 h-6 rotate-180" />
            </button>
            <button onClick={handleNext} className="absolute right-4 p-3 bg-black/50 hover:bg-white/20 text-white rounded-full backdrop-blur-sm transition-all">
              <ArrowRight className="w-6 h-6" />
            </button>

            {/* Caption & Delete */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-4">
              <button 
                onClick={() => handleDelete(images[currentIndex].id)}
                className="px-4 py-2 bg-red-600/80 hover:bg-red-600 text-white text-sm rounded-full backdrop-blur-sm flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" /> Delete Image
              </button>
            </div>
          </>
        ) : (
          <div className="text-gray-500 flex flex-col items-center">
            <ImageIcon className="w-16 h-16 mb-4 opacity-50" />
            <p>No images uploaded yet</p>
          </div>
        )}
      </div>

      {/* Footer / Upload */}
      <div className="p-4 bg-gray-900 border-t border-gray-800 flex gap-4 overflow-x-auto items-center">
        <label className="flex-shrink-0 w-20 h-20 border-2 border-dashed border-gray-700 rounded-lg flex flex-col items-center justify-center text-gray-500 hover:text-white hover:border-gray-500 cursor-pointer transition-colors">
          {isUploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Plus className="w-6 h-6" />}
          <span className="text-[10px] mt-1">Upload</span>
          <input type="file" multiple accept="image/*" className="hidden" onChange={handleUpload} />
        </label>
        {images.map((img, idx) => (
          <button 
            key={img.id}
            onClick={() => setCurrentIndex(idx)}
            className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
              idx === currentIndex ? 'border-blue-500 opacity-100 scale-105' : 'border-transparent opacity-50 hover:opacity-100'
            }`}
          >
            <img src={img.image_url} className="w-full h-full object-cover" alt="" />
          </button>
        ))}
      </div>
    </div>
  );
};


const PropertyManagement = () => {
  const { properties, addProperty, updateProperty, deleteProperty } = useProperty();
  
  // UI State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState(null);
  const [expandedPropertyId, setExpandedPropertyId] = useState(null); 
  const [viewingDetailsProperty, setViewingDetailsProperty] = useState(null); 
  const [galleryProperty, setGalleryProperty] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Inject CSS for animations
  useEffect(() => {
    const styleSheet = document.createElement("style");
    styleSheet.innerText = `
      @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      .animate-fade-in-up { animation: fadeInUp 0.3s ease-out forwards; }
      .scrollbar-hide::-webkit-scrollbar { display: none; }
      .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
    `;
    document.head.appendChild(styleSheet);
    return () => document.head.removeChild(styleSheet);
  }, []);

  // --- Handlers ---

  const handleAdd = () => {
    setEditingProperty(null);
    setIsModalOpen(true);
  };

  const handleEdit = (property) => {
    setEditingProperty(property);
    setIsModalOpen(true);
  };

  const handleToggleExpand = (propertyId) => {
    setExpandedPropertyId(prev => prev === propertyId ? null : propertyId);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this property? All associated units will be removed.')) {
      const toastId = toast.loading('Deleting property...');
      try {
        await deleteProperty(id);
        toast.success('Property deleted successfully', { id: toastId });
      } catch (error) {
        toast.error('Failed to delete property', { id: toastId });
      }
    }
  };

  const handleSaveProperty = async (formData) => {
    const toastId = toast.loading(editingProperty ? 'Updating property...' : 'Creating property...');
    try {
      if (editingProperty) {
        await updateProperty(editingProperty.id, formData);
        toast.success('Property updated successfully', { id: toastId });
      } else {
        await addProperty(formData);
        toast.success('Property created successfully', { id: toastId });
      }
      setIsModalOpen(false);
    } catch (error) {
      toast.error(error.message || 'An error occurred', { id: toastId });
    }
  };

  // --- Filtering ---
  
  const filteredProperties = properties.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.property_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.town.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <Toaster position="bottom-right" reverseOrder={false} />
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building className="w-8 h-8 text-blue-600" />
            Property Management
          </h1>
          <p className="text-gray-500 mt-1">Manage your real estate portfolio, units, and galleries.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search properties..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full sm:w-64 transition-all"
            />
          </div>
          <button 
            onClick={handleAdd}
            className="flex items-center justify-center space-x-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-95"
          >
            <Plus className="w-5 h-5" />
            <span className="font-medium">Add Property</span>
          </button>
        </div>
      </div>

      {/* Grid */}
      {filteredProperties.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-8">
          {filteredProperties.map(property => (
            <PropertyCard 
              key={property.id} 
              property={property} 
              onManageUnits={handleToggleExpand}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onViewDetails={setViewingDetailsProperty}
              onOpenGallery={setGalleryProperty}
              isExpanded={expandedPropertyId === property.id}
              onToggleExpand={handleToggleExpand}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-24 bg-white rounded-2xl border-2 border-dashed border-gray-200">
          <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Building2 className="w-10 h-10 text-gray-400" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">No properties found</h3>
          <p className="text-gray-500 mt-2 max-w-sm mx-auto">Your portfolio is currently empty. Get started by adding your first property above.</p>
        </div>
      )}

      {/* --- Modals --- */}

      {/* View Details Modal */}
      {viewingDetailsProperty && (
        <PropertyDetailsModal 
          property={viewingDetailsProperty} 
          onClose={() => setViewingDetailsProperty(null)}
          onOpenGallery={setGalleryProperty}
        />
      )}

      {/* Gallery Modal */}
      {galleryProperty && (
        <ImageGalleryModal 
          property={galleryProperty}
          onClose={() => setGalleryProperty(null)}
        />
      )}

      {/* Add/Edit Property Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setIsModalOpen(false)}
          />
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-xl font-bold text-gray-900">
                {editingProperty ? 'Edit Property' : 'Create New Property'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const data = Object.fromEntries(formData.entries());
                handleSaveProperty(data);
              }}
              className="p-8 space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">Property Code</label>
                  <input 
                    name="property_code" 
                    defaultValue={editingProperty?.property_code} 
                    required 
                    placeholder="e.g. AP001"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-gray-50 focus:bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">Property Name</label>
                  <input 
                    name="name" 
                    defaultValue={editingProperty?.name} 
                    required 
                    placeholder="e.g. Sunrise Apartments"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-gray-50 focus:bg-white"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Address</label>
                <input 
                  name="address" 
                  defaultValue={editingProperty?.address} 
                  required 
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-gray-50 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">Town</label>
                  <input 
                    name="town" 
                    defaultValue={editingProperty?.town} 
                    required 
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-gray-50 focus:bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">County</label>
                  <input 
                    name="county" 
                    defaultValue={editingProperty?.county} 
                    required 
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-gray-50 focus:bg-white"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Initial Units</label>
                <input 
                  type="number"
                  name="total_units" 
                  defaultValue={editingProperty?.total_units || 0} 
                  required 
                  min="0"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-gray-50 focus:bg-white"
                />
                <p className="text-xs text-gray-500 ml-1">Note: Actual capacity is determined by units created.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Description</label>
                <textarea 
                  name="description" 
                  defaultValue={editingProperty?.description} 
                  rows="3"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-gray-50 focus:bg-white resize-none"
                />
              </div>

              <div className="flex justify-end pt-4 space-x-3 border-t border-gray-100">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-3 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors font-medium"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition-all font-medium active:scale-95"
                >
                  {editingProperty ? 'Update Property' : 'Create Property'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PropertyManagement;