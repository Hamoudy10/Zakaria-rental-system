// src/components/AgentAllocation.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users,
  Building2,
  ClipboardList,
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  GripVertical,
  ArrowRight,
  History,
  Trash2,
  UserCheck,
  Home,
  TrendingUp,
  X,
  Check,
  Clock,
  Loader2,
  Building,
  UserPlus,
  FolderOpen,
  ArrowLeftRight,
  Layers,
  PieChart,
  CheckSquare,
  Square,
  MinusSquare
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import {
  useSortable,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import adminService from '../services/AdminService';

// ==================== TOAST NOTIFICATION SYSTEM ====================
const ToastContainer = ({ toasts, removeToast }) => {
  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onRemove={() => removeToast(toast.id)} />
      ))}
    </div>
  );
};

const Toast = ({ toast, onRemove }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onRemove();
    }, toast.duration || 4000);
    return () => clearTimeout(timer);
  }, [onRemove, toast.duration]);

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-green-500" />,
    error: <XCircle className="w-5 h-5 text-red-500" />,
    warning: <AlertCircle className="w-5 h-5 text-amber-500" />,
    info: <AlertCircle className="w-5 h-5 text-blue-500" />,
  };

  const bgColors = {
    success: 'bg-green-50 border-green-200',
    error: 'bg-red-50 border-red-200',
    warning: 'bg-amber-50 border-amber-200',
    info: 'bg-blue-50 border-blue-200',
  };

  return (
    <div
      className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg ${bgColors[toast.type]} animate-slideDown min-w-[300px] max-w-[500px]`}
    >
      {icons[toast.type]}
      <p className="flex-1 text-sm font-medium text-gray-800">{toast.message}</p>
      <button
        onClick={onRemove}
        className="text-gray-400 hover:text-gray-600 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

// Custom hook for toast management
const useToast = () => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type, duration }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
};

// ==================== DRAGGABLE PROPERTY CARD ====================
const DraggablePropertyCard = ({ property, isSelected, onSelect, onDragStart, assignedAgent }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: property.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative bg-white rounded-xl border-2 transition-all duration-200 ${
        isDragging 
          ? 'shadow-2xl border-blue-400 scale-105' 
          : isSelected 
            ? 'border-blue-500 shadow-md bg-blue-50/30' 
            : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
      }`}
    >
      {/* Selection Checkbox */}
      <div 
        className="absolute top-3 left-3 z-10 cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          onSelect(property.id);
        }}
      >
        {isSelected ? (
          <CheckSquare className="w-5 h-5 text-blue-600" />
        ) : (
          <Square className="w-5 h-5 text-gray-400 hover:text-gray-600" />
        )}
      </div>

      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-3 right-3 cursor-grab active:cursor-grabbing p-1 rounded hover:bg-gray-100 transition-colors"
      >
        <GripVertical className="w-4 h-4 text-gray-400" />
      </div>

      <div className="p-4 pt-10">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${assignedAgent ? 'bg-green-100' : 'bg-blue-100'}`}>
            <Building2 className={`w-5 h-5 ${assignedAgent ? 'text-green-600' : 'text-blue-600'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-gray-900 truncate">{property.name}</h4>
            <p className="text-sm text-gray-500 truncate">{property.address || 'No address'}</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-gray-600">
            <Layers className="w-3.5 h-3.5" />
            <span>{property.total_units || 0} units</span>
          </div>
          <div className="flex items-center gap-1.5 text-green-600">
            <Home className="w-3.5 h-3.5" />
            <span>{property.occupied_units || 0} occupied</span>
          </div>
        </div>

        {assignedAgent ? (
          <div className="mt-3 flex items-center gap-2 px-2 py-1.5 bg-green-50 rounded-lg border border-green-100">
            <UserCheck className="w-3.5 h-3.5 text-green-600" />
            <span className="text-xs font-medium text-green-700 truncate">{assignedAgent}</span>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2 px-2 py-1.5 bg-amber-50 rounded-lg border border-amber-100">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            <span className="text-xs font-medium text-amber-700">Unassigned</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== AGENT DROP ZONE CARD ====================
const AgentDropZone = ({ 
  agent, 
  properties, 
  allocations, 
  onRemoveAllocation, 
  onReassign, 
  isOver,
  allAgents 
}) => {
  const [expandedStats, setExpandedStats] = useState(false);
  const [reassigningProperty, setReassigningProperty] = useState(null);
  const [swipedProperty, setSwipedProperty] = useState(null);
  const [touchStart, setTouchStart] = useState(null);

  const agentAllocations = allocations.filter(a => a.agent_id === agent.id);
  const assignedProperties = properties.filter(p => 
    agentAllocations.some(a => a.property_id === p.id)
  );

  // Calculate stats
  const stats = useMemo(() => {
    const totalUnits = assignedProperties.reduce((sum, p) => sum + (p.total_units || 0), 0);
    const occupiedUnits = assignedProperties.reduce((sum, p) => sum + (p.occupied_units || 0), 0);
    const vacantUnits = totalUnits - occupiedUnits;
    const tenants = occupiedUnits; // Approximation: 1 tenant per occupied unit

    return {
      properties: assignedProperties.length,
      totalUnits,
      occupiedUnits,
      vacantUnits,
      tenants,
      occupancyRate: totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0
    };
  }, [assignedProperties]);

  // Swipe handlers for mobile
  const handleTouchStart = (e, propertyId) => {
    setTouchStart(e.touches[0].clientX);
    setSwipedProperty(propertyId);
  };

  const handleTouchEnd = (e, property, allocation) => {
    if (!touchStart) return;
    
    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStart - touchEnd;

    if (Math.abs(diff) > 80) { // Minimum swipe distance
      if (diff > 0) {
        // Swipe left - Remove
        onRemoveAllocation(allocation.id, property.name, agent);
      } else {
        // Swipe right - Reassign
        setReassigningProperty(property.id);
      }
    }
    
    setTouchStart(null);
    setSwipedProperty(null);
  };

  return (
    <div
      className={`bg-white rounded-2xl border-2 transition-all duration-300 overflow-hidden ${
        isOver 
          ? 'border-blue-500 shadow-xl ring-4 ring-blue-100 scale-[1.02]' 
          : 'border-gray-200 hover:border-gray-300 shadow-sm hover:shadow-md'
      }`}
    >
      {/* Agent Header */}
      <div className="p-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-md">
              {agent.first_name?.[0]}{agent.last_name?.[0]}
            </div>
            {stats.properties > 0 && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                <span className="text-[10px] text-white font-bold">{stats.properties}</span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900">{agent.first_name} {agent.last_name}</h3>
            <p className="text-sm text-gray-500 truncate">{agent.email}</p>
          </div>
          <button
            onClick={() => setExpandedStats(!expandedStats)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {expandedStats ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </button>
        </div>

        {/* Quick Stats Bar */}
        <div className="mt-3 grid grid-cols-4 gap-2">
          <div className="text-center p-2 bg-blue-50 rounded-lg">
            <p className="text-lg font-bold text-blue-600">{stats.properties}</p>
            <p className="text-[10px] text-blue-600/70 uppercase tracking-wide">Properties</p>
          </div>
          <div className="text-center p-2 bg-purple-50 rounded-lg">
            <p className="text-lg font-bold text-purple-600">{stats.totalUnits}</p>
            <p className="text-[10px] text-purple-600/70 uppercase tracking-wide">Units</p>
          </div>
          <div className="text-center p-2 bg-green-50 rounded-lg">
            <p className="text-lg font-bold text-green-600">{stats.occupiedUnits}</p>
            <p className="text-[10px] text-green-600/70 uppercase tracking-wide">Occupied</p>
          </div>
          <div className="text-center p-2 bg-amber-50 rounded-lg">
            <p className="text-lg font-bold text-amber-600">{stats.vacantUnits}</p>
            <p className="text-[10px] text-amber-600/70 uppercase tracking-wide">Vacant</p>
          </div>
        </div>

        {/* Expanded Stats */}
        {expandedStats && (
          <div className="mt-3 p-3 bg-gray-50 rounded-xl animate-fadeIn">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-600">
                  <span className="font-semibold">{stats.tenants}</span> Tenants
                </span>
              </div>
              <div className="flex items-center gap-2">
                <PieChart className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-600">
                  <span className="font-semibold">{stats.occupancyRate}%</span> Occupancy
                </span>
              </div>
            </div>
            {/* Occupancy Progress Bar */}
            <div className="mt-3">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-green-400 to-green-500 transition-all duration-500"
                  style={{ width: `${stats.occupancyRate}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Assigned Properties List */}
      <div className="p-4">
        {assignedProperties.length === 0 ? (
          <div className={`p-6 border-2 border-dashed rounded-xl text-center transition-all duration-300 ${
            isOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50'
          }`}>
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-100 flex items-center justify-center">
              <Building className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-500">
              {isOver ? 'Drop property here!' : 'No properties assigned'}
            </p>
            <p className="text-xs text-gray-400 mt-1">Drag properties here to assign</p>
          </div>
        ) : (
          <div className="space-y-2">
            {assignedProperties.map(property => {
              const allocation = agentAllocations.find(a => a.property_id === property.id);
              const isReassigning = reassigningProperty === property.id;
              const isSwiped = swipedProperty === property.id;

              return (
                <div
                  key={property.id}
                  className={`relative overflow-hidden rounded-xl border transition-all duration-200 ${
                    isSwiped ? 'bg-gray-50' : 'bg-white hover:bg-gray-50'
                  } border-gray-200`}
                  onTouchStart={(e) => handleTouchStart(e, property.id)}
                  onTouchEnd={(e) => handleTouchEnd(e, property, allocation)}
                >
                  <div className="flex items-center gap-3 p-3">
                    <div className="p-2 rounded-lg bg-green-100">
                      <Building2 className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate text-sm">{property.name}</p>
                      <p className="text-xs text-gray-500">
                        {property.occupied_units || 0}/{property.total_units || 0} units occupied
                      </p>
                    </div>

                    {isReassigning ? (
                      <div className="flex items-center gap-2 animate-fadeIn">
                        <select
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          onChange={(e) => {
                            if (e.target.value) {
                              onReassign(property.id, allocation.id, e.target.value);
                              setReassigningProperty(null);
                            }
                          }}
                          defaultValue=""
                        >
                          <option value="">Select agent...</option>
                          {allAgents
                            .filter(a => a.id !== agent.id)
                            .map(a => (
                              <option key={a.id} value={a.id}>
                                {a.first_name} {a.last_name}
                              </option>
                            ))
                          }
                        </select>
                        <button
                          onClick={() => setReassigningProperty(null)}
                          className="p-1 rounded hover:bg-gray-200"
                        >
                          <X className="w-4 h-4 text-gray-500" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setReassigningProperty(property.id)}
                          className="p-1.5 rounded-lg hover:bg-blue-100 text-gray-400 hover:text-blue-600 transition-colors"
                          title="Reassign"
                        >
                          <ArrowLeftRight className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onRemoveAllocation(allocation.id, property.name, agent)}
                          className="p-1.5 rounded-lg hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Swipe Hint (Mobile) */}
                  <div className="sm:hidden absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-blue-400 to-blue-600 opacity-0 hover:opacity-100 transition-opacity" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== EMPTY STATE COMPONENT ====================
const EmptyState = ({ type, onAction, actionLabel }) => {
  const configs = {
    agents: {
      icon: Users,
      title: 'No Agents Found',
      description: 'There are no agents in the system yet. Create agent accounts to start assigning properties.',
      color: 'blue'
    },
    properties: {
      icon: Building2,
      title: 'No Properties Found',
      description: 'There are no properties in the system yet. Add properties to start managing your portfolio.',
      color: 'green'
    },
    allocations: {
      icon: ClipboardList,
      title: 'No Allocations Yet',
      description: 'Drag properties onto agents to assign them, or use the selection tools for bulk assignment.',
      color: 'purple'
    },
    unassigned: {
      icon: CheckCircle2,
      title: 'All Properties Assigned!',
      description: 'Great job! All properties have been assigned to agents.',
      color: 'green'
    }
  };

  const config = configs[type];
  const Icon = config.icon;
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    purple: 'bg-purple-100 text-purple-600'
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center animate-fadeIn">
      <div className={`w-16 h-16 rounded-2xl ${colorClasses[config.color]} flex items-center justify-center mb-4`}>
        <Icon className="w-8 h-8" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{config.title}</h3>
      <p className="text-sm text-gray-500 max-w-sm mb-4">{config.description}</p>
      {onAction && (
        <button
          onClick={onAction}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

// ==================== ASSIGNMENT HISTORY PANEL ====================
const AssignmentHistory = ({ history, isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white shadow-2xl animate-slideInRight">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <History className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Assignment History</h3>
              <p className="text-xs text-gray-500">This session only</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 max-h-[calc(100vh-80px)] overflow-y-auto">
          {history.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No changes made this session</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((item, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl animate-fadeIn"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className={`p-1.5 rounded-lg ${
                    item.action === 'assigned' 
                      ? 'bg-green-100' 
                      : item.action === 'removed' 
                        ? 'bg-red-100' 
                        : 'bg-blue-100'
                  }`}>
                    {item.action === 'assigned' && <UserPlus className="w-4 h-4 text-green-600" />}
                    {item.action === 'removed' && <Trash2 className="w-4 h-4 text-red-600" />}
                    {item.action === 'reassigned' && <ArrowLeftRight className="w-4 h-4 text-blue-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{item.propertyName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{item.timestamp}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ==================== MAIN COMPONENT ====================
const AgentAllocation = () => {
  const [agents, setAgents] = useState([]);
  const [properties, setProperties] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  
  // Search states
  const [agentSearch, setAgentSearch] = useState('');
  const [propertySearch, setPropertySearch] = useState('');
  
  // Selection states
  const [selectedProperties, setSelectedProperties] = useState([]);
  const [selectedAgentForBulk, setSelectedAgentForBulk] = useState('');
  
  // History state (session-based)
  const [assignmentHistory, setAssignmentHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  
  // Drag state
  const [activeProperty, setActiveProperty] = useState(null);
  const [overAgent, setOverAgent] = useState(null);

  // Toast hook
  const { toasts, addToast, removeToast } = useToast();

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Helper function to extract data from API responses
  const extractDataFromResponse = (response) => {
    if (Array.isArray(response)) return response;
    if (response?.data && Array.isArray(response.data)) return response.data;
    if (response?.data?.data && Array.isArray(response.data.data)) return response.data.data;
    if (response?.users && Array.isArray(response.users)) return response.users;
    if (response?.properties && Array.isArray(response.properties)) return response.properties;
    if (response?.data?.users && Array.isArray(response.data.users)) return response.data.users;
    if (response?.data?.properties && Array.isArray(response.data.properties)) return response.data.properties;
    return [];
  };

  // Fetch data
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get users
      const usersResponse = await adminService.getUsers();
      const allUsers = extractDataFromResponse(usersResponse);
      const agentUsers = allUsers.filter(user => {
        const role = user.role?.toLowerCase?.() || user.role;
        return role === 'agent';
      });
      setAgents(agentUsers);

      // Get properties
      const propertiesResponse = await adminService.getProperties();
      const propertiesData = extractDataFromResponse(propertiesResponse);
      setProperties(Array.isArray(propertiesData) ? propertiesData : []);

      // Get allocations
      try {
        const allocationsResponse = await adminService.getAgentAllocations();
        const allocationsData = extractDataFromResponse(allocationsResponse);
        setAllocations(Array.isArray(allocationsData) ? allocationsData : []);
      } catch {
        setAllocations([]);
      }

    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load data. Please check if the backend is running.');
      addToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Add to history
  const addToHistory = (action, propertyName, description) => {
    setAssignmentHistory(prev => [{
      action,
      propertyName,
      description,
      timestamp: new Date().toLocaleTimeString()
    }, ...prev]);
  };

  // Get agent name helper
  const getAgentName = (agentId) => {
    const agent = agents.find(a => a.id === agentId);
    return agent ? `${agent.first_name} ${agent.last_name}` : 'Unknown';
  };

  // Get property name helper
  const getPropertyName = (propertyId) => {
    const property = properties.find(p => p.id === propertyId);
    return property?.name || 'Unknown';
  };

  // Get assigned agent for property
  const getAssignedAgentForProperty = (propertyId) => {
    const allocation = allocations.find(a => a.property_id === propertyId);
    return allocation ? getAgentName(allocation.agent_id) : null;
  };

  // Handle property selection
  const handlePropertySelect = (propertyId) => {
    setSelectedProperties(prev => 
      prev.includes(propertyId)
        ? prev.filter(id => id !== propertyId)
        : [...prev, propertyId]
    );
  };

  // Handle select all unassigned
  const handleSelectAllUnassigned = () => {
    const unassignedIds = properties
      .filter(p => !allocations.some(a => a.property_id === p.id))
      .map(p => p.id);
    
    const allSelected = unassignedIds.every(id => selectedProperties.includes(id));
    
    if (allSelected) {
      setSelectedProperties(prev => prev.filter(id => !unassignedIds.includes(id)));
    } else {
      setSelectedProperties(prev => [...new Set([...prev, ...unassignedIds])]);
    }
  };

  // Assign single property to agent
  const assignPropertyToAgent = async (propertyId, agentId) => {
    try {
      await adminService.assignPropertiesToAgent(agentId, [propertyId]);
      
      const propertyName = getPropertyName(propertyId);
      const agentName = getAgentName(agentId);
      
      addToast(`Assigned "${propertyName}" to ${agentName}`, 'success');
      addToHistory('assigned', propertyName, `Assigned to ${agentName}`);
      
      await fetchData();
      return true;
    } catch (err) {
      console.error('Error assigning property:', err);
      addToast('Failed to assign property', 'error');
      return false;
    }
  };

  // Bulk assign properties
  const handleBulkAssign = async () => {
    if (!selectedAgentForBulk || selectedProperties.length === 0) {
      addToast('Please select an agent and at least one property', 'warning');
      return;
    }

    setSaving(true);
    const agentName = getAgentName(selectedAgentForBulk);
    let successCount = 0;

    for (const propertyId of selectedProperties) {
      try {
        await adminService.assignPropertiesToAgent(selectedAgentForBulk, [propertyId]);
        const propertyName = getPropertyName(propertyId);
        addToHistory('assigned', propertyName, `Assigned to ${agentName}`);
        successCount++;
      } catch (err) {
        console.error(`Failed to assign property ${propertyId}:`, err);
      }
    }

    if (successCount > 0) {
      addToast(`Assigned ${successCount} properties to ${agentName}`, 'success');
    }
    if (successCount < selectedProperties.length) {
      addToast(`Failed to assign ${selectedProperties.length - successCount} properties`, 'error');
    }

    setSelectedProperties([]);
    setSelectedAgentForBulk('');
    await fetchData();
    setSaving(false);
  };

  // Remove allocation
  const handleRemoveAllocation = async (allocationId, propertyName, agent) => {
    try {
      await adminService.removeAgentAllocation(allocationId);
      addToast(`Removed "${propertyName}" from ${agent.first_name}`, 'success');
      addToHistory('removed', propertyName, `Removed from ${agent.first_name} ${agent.last_name}`);
      await fetchData();
    } catch (err) {
      console.error('Error removing allocation:', err);
      addToast('Failed to remove allocation', 'error');
    }
  };

  // Bulk remove
  const handleBulkRemove = async () => {
    const allocationsToRemove = allocations.filter(a => 
      selectedProperties.includes(a.property_id)
    );

    if (allocationsToRemove.length === 0) {
      addToast('No assigned properties selected', 'warning');
      return;
    }

    setSaving(true);
    let successCount = 0;

    for (const allocation of allocationsToRemove) {
      try {
        await adminService.removeAgentAllocation(allocation.id);
        const propertyName = getPropertyName(allocation.property_id);
        const agentName = getAgentName(allocation.agent_id);
        addToHistory('removed', propertyName, `Removed from ${agentName}`);
        successCount++;
      } catch (err) {
        console.error('Error removing allocation:', err);
      }
    }

    addToast(`Removed ${successCount} allocations`, 'success');
    setSelectedProperties([]);
    await fetchData();
    setSaving(false);
  };

  // Reassign property
  const handleReassign = async (propertyId, oldAllocationId, newAgentId) => {
    try {
      // Remove old allocation
      await adminService.removeAgentAllocation(oldAllocationId);
      // Create new allocation
      await adminService.assignPropertiesToAgent(newAgentId, [propertyId]);
      
      const propertyName = getPropertyName(propertyId);
      const newAgentName = getAgentName(newAgentId);
      
      addToast(`Reassigned "${propertyName}" to ${newAgentName}`, 'success');
      addToHistory('reassigned', propertyName, `Reassigned to ${newAgentName}`);
      
      await fetchData();
    } catch (err) {
      console.error('Error reassigning property:', err);
      addToast('Failed to reassign property', 'error');
    }
  };

  // DnD handlers
  const handleDragStart = (event) => {
    const property = properties.find(p => p.id === event.active.id);
    setActiveProperty(property);
  };

  const handleDragOver = (event) => {
    const { over } = event;
    if (over && over.id.toString().startsWith('agent-')) {
      setOverAgent(over.id.replace('agent-', ''));
    } else {
      setOverAgent(null);
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    
    if (over && over.id.toString().startsWith('agent-')) {
      const agentId = over.id.replace('agent-', '');
      const propertyId = active.id;
      
      // Check if already assigned to this agent
      const existingAllocation = allocations.find(
        a => a.property_id === propertyId && a.agent_id === agentId
      );
      
      if (existingAllocation) {
        addToast('Property already assigned to this agent', 'warning');
      } else {
        // Check if assigned to another agent
        const otherAllocation = allocations.find(a => a.property_id === propertyId);
        if (otherAllocation) {
          // Reassign
          await handleReassign(propertyId, otherAllocation.id, agentId);
        } else {
          // New assignment
          await assignPropertyToAgent(propertyId, agentId);
        }
      }
    }
    
    setActiveProperty(null);
    setOverAgent(null);
  };

  // Filtered data
  const filteredAgents = agents.filter(agent =>
    `${agent.first_name} ${agent.last_name} ${agent.email}`
      .toLowerCase()
      .includes(agentSearch.toLowerCase())
  );

  const filteredProperties = properties.filter(property =>
    (property.name || '').toLowerCase().includes(propertySearch.toLowerCase()) ||
    (property.address || '').toLowerCase().includes(propertySearch.toLowerCase())
  );

  const unassignedProperties = filteredProperties.filter(
    p => !allocations.some(a => a.property_id === p.id)
  );

  const assignedProperties = filteredProperties.filter(
    p => allocations.some(a => a.property_id === p.id)
  );

  // Selection state for checkboxes
  const unassignedIds = unassignedProperties.map(p => p.id);
  const allUnassignedSelected = unassignedIds.length > 0 && unassignedIds.every(id => selectedProperties.includes(id));
  const someUnassignedSelected = unassignedIds.some(id => selectedProperties.includes(id));

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-blue-200 rounded-full animate-pulse" />
          <Loader2 className="w-8 h-8 text-blue-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin" />
        </div>
        <p className="text-gray-600 font-medium">Loading allocation data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
          <XCircle className="w-8 h-8 text-red-600" />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Failed to Load Data</h3>
          <p className="text-sm text-gray-500 mb-4 max-w-sm">{error}</p>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-6">
        {/* Toast Container */}
        <ToastContainer toasts={toasts} removeToast={removeToast} />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Agent Allocation</h1>
            <p className="text-gray-500 text-sm mt-1">
              Assign properties to agents for management
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHistory(true)}
              className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors inline-flex items-center gap-2"
            >
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">History</span>
              {assignmentHistory.length > 0 && (
                <span className="w-5 h-5 bg-blue-100 text-blue-600 rounded-full text-xs flex items-center justify-center">
                  {assignmentHistory.length}
                </span>
              )}
            </button>
            <button
              onClick={fetchData}
              className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors inline-flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{agents.length}</p>
                <p className="text-xs text-gray-500">Agents</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{properties.length}</p>
                <p className="text-xs text-gray-500">Properties</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                <ClipboardList className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{allocations.length}</p>
                <p className="text-xs text-gray-500">Assigned</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{properties.length - allocations.length}</p>
                <p className="text-xs text-gray-500">Unassigned</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bulk Actions Bar */}
        {selectedProperties.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 animate-slideDown">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                  <CheckSquare className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-blue-900">
                    {selectedProperties.length} properties selected
                  </p>
                  <p className="text-xs text-blue-600">Choose an action below</p>
                </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedAgentForBulk}
                  onChange={(e) => setSelectedAgentForBulk(e.target.value)}
                  className="flex-1 sm:flex-none px-3 py-2 border border-blue-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="">Assign to agent...</option>
                  {agents.map(agent => (
                    <option key={agent.id} value={agent.id}>
                      {agent.first_name} {agent.last_name}
                    </option>
                  ))}
                </select>
                
                <button
                  onClick={handleBulkAssign}
                  disabled={!selectedAgentForBulk || saving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  Assign
                </button>
                
                <button
                  onClick={handleBulkRemove}
                  disabled={saving}
                  className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Remove
                </button>
                
                <button
                  onClick={() => setSelectedProperties([])}
                  className="px-4 py-2 bg-white border border-blue-200 text-blue-700 rounded-xl text-sm font-medium hover:bg-blue-50 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Properties Panel */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-gray-900">Properties</h2>
                {unassignedProperties.length > 0 && (
                  <button
                    onClick={handleSelectAllUnassigned}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1"
                  >
                    {allUnassignedSelected ? (
                      <>
                        <MinusSquare className="w-4 h-4" />
                        Deselect All
                      </>
                    ) : (
                      <>
                        <CheckSquare className="w-4 h-4" />
                        Select All Unassigned
                      </>
                    )}
                  </button>
                )}
              </div>
              
              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search properties..."
                  value={propertySearch}
                  onChange={(e) => setPropertySearch(e.target.value)}
                  className="w-full pl-4 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
            </div>

            <div className="p-4 max-h-[600px] overflow-y-auto">
              {filteredProperties.length === 0 ? (
                <EmptyState type="properties" />
              ) : (
                <div className="space-y-6">
                  {/* Unassigned Section */}
                  {unassignedProperties.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2 rounded-full bg-amber-500" />
                        <h3 className="text-sm font-semibold text-gray-700">
                          Unassigned ({unassignedProperties.length})
                        </h3>
                      </div>
                      <SortableContext
                        items={unassignedProperties.map(p => p.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="grid gap-3">
                          {unassignedProperties.map(property => (
                            <DraggablePropertyCard
                              key={property.id}
                              property={property}
                              isSelected={selectedProperties.includes(property.id)}
                              onSelect={handlePropertySelect}
                              assignedAgent={null}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </div>
                  )}

                  {/* Assigned Section */}
                  {assignedProperties.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <h3 className="text-sm font-semibold text-gray-700">
                          Assigned ({assignedProperties.length})
                        </h3>
                      </div>
                      <SortableContext
                        items={assignedProperties.map(p => p.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="grid gap-3">
                          {assignedProperties.map(property => (
                            <DraggablePropertyCard
                              key={property.id}
                              property={property}
                              isSelected={selectedProperties.includes(property.id)}
                              onSelect={handlePropertySelect}
                              assignedAgent={getAssignedAgentForProperty(property.id)}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </div>
                  )}

                  {unassignedProperties.length === 0 && assignedProperties.length > 0 && (
                    <div className="text-center py-4">
                      <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-full text-sm font-medium">
                        <CheckCircle2 className="w-4 h-4" />
                        All properties are assigned!
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Agents Panel */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Agents</h2>
              
              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search agents..."
                  value={agentSearch}
                  onChange={(e) => setAgentSearch(e.target.value)}
                  className="w-full pl-4 pr-10 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </div>
            </div>

            <div className="p-4 max-h-[600px] overflow-y-auto">
              {filteredAgents.length === 0 ? (
                <EmptyState type="agents" />
              ) : (
                <div className="space-y-4">
                  {filteredAgents.map(agent => (
                    <div key={agent.id} id={`agent-${agent.id}`}>
                      <AgentDropZone
                        agent={agent}
                        properties={properties}
                        allocations={allocations}
                        onRemoveAllocation={handleRemoveAllocation}
                        onReassign={handleReassign}
                        isOver={overAgent === agent.id}
                        allAgents={agents}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
          {activeProperty ? (
            <div className="bg-white rounded-xl border-2 border-blue-500 shadow-2xl p-4 w-64 opacity-90">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100">
                  <Building2 className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{activeProperty.name}</p>
                  <p className="text-xs text-gray-500">{activeProperty.total_units || 0} units</p>
                </div>
              </div>
            </div>
          ) : null}
        </DragOverlay>

        {/* History Panel */}
        <AssignmentHistory
          history={assignmentHistory}
          isOpen={showHistory}
          onClose={() => setShowHistory(false)}
        />
      </div>

      {/* Custom Animations */}
      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        
        .animate-slideDown {
          animation: slideDown 0.3s ease-out;
        }
        
        .animate-slideInRight {
          animation: slideInRight 0.3s ease-out;
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
      `}</style>
    </DndContext>
  );
};

export default AgentAllocation;