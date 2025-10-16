import React, { createContext, useState, useContext, useCallback, useEffect } from 'react'

const AuthContext = createContext(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(false)
  const [users, setUsers] = useState([])

  // Mock data - in real app, this would come from API
  useEffect(() => {
    const mockUsers = [
      {
        id: '1',
        national_id: '00000000',
        first_name: 'System',
        last_name: 'Administrator',
        email: 'admin@abdallah.co.ke',
        phone_number: '254700000000',
        role: 'admin',
        is_active: true,
        created_at: new Date().toISOString(),
      },
      {
        id: '2',
        national_id: '11111111',
        first_name: 'John',
        last_name: 'Kamau',
        email: 'agent@abdallah.co.ke',
        phone_number: '254711111111',
        role: 'agent',
        is_active: true,
        created_at: new Date().toISOString(),
      },
      {
        id: '3',
        national_id: '22222222',
        first_name: 'Mary',
        last_name: 'Wanjiku',
        email: 'tenant@abdallah.co.ke',
        phone_number: '254722222222',
        role: 'tenant',
        is_active: true,
        created_at: new Date().toISOString(),
      }
    ]
    setUsers(mockUsers)
  }, [])

  const login = useCallback(async (email, password) => {
    setLoading(true)
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Find user in mock data
      const foundUser = users.find(u => u.email === email)
      
      if (foundUser) {
        const userWithAvatar = {
          ...foundUser,
          avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(foundUser.first_name + ' ' + foundUser.last_name)}&background=0ea5e9&color=fff`
        }
        setUser(userWithAvatar)
        return { success: true, user: userWithAvatar }
      } else {
        return { success: false, error: 'Invalid email or password' }
      }
    } catch (error) {
      return { success: false, error: error.message }
    } finally {
      setLoading(false)
    }
  }, [users])

  const logout = useCallback(() => {
    setUser(null)
  }, [])

  const addUser = useCallback((userData) => {
    const newUser = {
      id: Math.random().toString(36).substr(2, 9),
      ...userData,
      is_active: true,
      created_at: new Date().toISOString(),
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.first_name + ' ' + userData.last_name)}&background=0ea5e9&color=fff`
    }
    setUsers(prev => [...prev, newUser])
    return newUser
  }, [])

  const updateUser = useCallback((userId, updates) => {
    setUsers(prev => prev.map(user => 
      user.id === userId ? { ...user, ...updates } : user
    ))
  }, [])

  const deleteUser = useCallback((userId) => {
    setUsers(prev => prev.filter(user => user.id !== userId))
  }, [])

  const value = React.useMemo(() => ({
    user,
    users,
    login,
    logout,
    loading,
    addUser,
    updateUser,
    deleteUser,
    isAuthenticated: !!user
  }), [user, users, login, logout, loading, addUser, updateUser, deleteUser])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}