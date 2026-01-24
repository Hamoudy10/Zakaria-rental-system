// src/components/AdminTenantBrowser.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Users,
  Building2,
  Filter,
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  FileText,
  Search,
  X,
  Check,
  RefreshCw,
  User,
  Phone,
  Mail,
  CreditCard,
  Home,
  Calendar,
  AlertCircle,
  Image,
  ExternalLink
} from 'lucide-react'
import api, { API } from '../services/api'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import ExcelJS from 'exceljs'

// Default company branding (fallback)
const DEFAULT_COMPANY = {
  name: 'Rental Management System',
  email: '',
  phone: '',
  address: '',
  logo: ''
}

// Cache for company info
let cachedCompanyInfo = null
let cacheTimestamp = null
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

const AdminTenantBrowser = () => {
  // Data state
  const [tenants, setTenants] = useState([])
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Filter state
  const [selectedProperties, setSelectedProperties] = useState([]) // empty = all
  const [allocationFilter, setAllocationFilter] = useState('all') // 'all', 'allocated', 'unallocated'
  const [searchQuery, setSearchQuery] = useState('')
  
  // Sort state
  const [sortBy, setSortBy] = useState('created_at') // 'created_at', 'name_asc', 'name_desc'
  
  // UI state
  const [expandedRows, setExpandedRows] = useState(new Set())
  const [showPropertyDropdown, setShowPropertyDropdown] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [exportType, setExportType] = useState(null) // 'pdf' or 'excel'
  const [includeImages, setIncludeImages] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Fetch data on mount
  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)

      const [tenantsRes, propertiesRes] = await Promise.all([
        api.get('/tenants'),
        api.get('/properties')
      ])

      if (tenantsRes.data.success) {
        setTenants(tenantsRes.data.data.tenants || [])
      }

      if (propertiesRes.data.success) {
        setProperties(propertiesRes.data.data || propertiesRes.data.data.properties || [])
      }
    } catch (err) {
      console.error('Error fetching data:', err)
      setError('Failed to load data. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Validate company info has all required fields
   */
  const isValidCompanyInfo = (info) => {
    if (!info || typeof info !== 'object') return false
    return info.name && (info.email || info.phone || info.address || info.logo)
  }

  /**
   * Fetch company info from API with caching
   */
  const fetchCompanyInfo = async () => {
    const now = Date.now()
    
    if (cachedCompanyInfo && cacheTimestamp && (now - cacheTimestamp < CACHE_DURATION)) {
      if (isValidCompanyInfo(cachedCompanyInfo)) {
        console.log('📦 Using cached company info:', cachedCompanyInfo)
        return cachedCompanyInfo
      }
    }
    
    try {
      console.log('🔄 Fetching company info from API...')
      const response = await API.settings.getCompanyInfo()
      console.log('📥 API Response:', response.data)
      
      if (response.data?.success && response.data?.data) {
        const companyData = response.data.data
        
        cachedCompanyInfo = {
          name: companyData.name || DEFAULT_COMPANY.name,
          email: companyData.email || '',
          phone: companyData.phone || '',
          address: companyData.address || '',
          logo: companyData.logo || ''
        }
        
        cacheTimestamp = now
        console.log('✅ Company info fetched and cached:', cachedCompanyInfo)
        return cachedCompanyInfo
      }
    } catch (error) {
      console.error('❌ Could not fetch company info:', error.message)
    }
    
    return DEFAULT_COMPANY
  }

  /**
   * Create a circular image from a base64 image
   */
  const createCircularImage = (base64Image) => {
    return new Promise((resolve, reject) => {
      const img = new window.Image()
      img.crossOrigin = 'anonymous'
      
      img.onload = () => {
        try {
          const size = Math.min(img.width, img.height)
          const canvas = document.createElement('canvas')
          canvas.width = size
          canvas.height = size
          
          const ctx = canvas.getContext('2d')
          
          // Create circular clipping path
          ctx.beginPath()
          ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
          ctx.closePath()
          ctx.clip()
          
          // Draw image centered in the circle
          const offsetX = (img.width - size) / 2
          const offsetY = (img.height - size) / 2
          ctx.drawImage(img, offsetX, offsetY, size, size, 0, 0, size, size)
          
          // Add subtle border
          ctx.strokeStyle = '#1E40AF'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2)
          ctx.stroke()
          
          const circularDataUrl = canvas.toDataURL('image/png')
          console.log('✅ Circular logo created')
          resolve(circularDataUrl)
        } catch (error) {
          reject(error)
        }
      }
      
      img.onerror = () => {
        reject(new Error('Failed to load image for circular crop'))
      }
      
      img.src = base64Image
    })
  }

  /**
   * Fetch logo as base64 and make it circular
   */
  const fetchLogoAsBase64 = async (logoUrl, makeCircular = true) => {
    if (!logoUrl) return null
    
    try {
      console.log('🔄 Loading logo from:', logoUrl)
      
      const response = await fetch(logoUrl, {
        mode: 'cors',
        cache: 'force-cache'
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const blob = await response.blob()
      
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.onerror = () => reject(new Error('FileReader failed'))
        reader.readAsDataURL(blob)
      })
      
      // Make the image circular if requested
      if (makeCircular) {
        try {
          const circularImage = await createCircularImage(base64)
          console.log('✅ Logo loaded and made circular')
          return circularImage
        } catch (circleError) {
          console.warn('Could not create circular image, using original:', circleError)
          return base64
        }
      }
      
      return base64
    } catch (error) {
      console.warn('Could not load logo:', error)
      return null
    }
  }

  /**
   * Fetch image as ArrayBuffer for Excel
   */
  const fetchImageAsBuffer = async (imageUrl) => {
    if (!imageUrl) return null
    
    try {
      const response = await fetch(imageUrl, {
        mode: 'cors',
        cache: 'force-cache'
      })
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const blob = await response.blob()
      const arrayBuffer = await blob.arrayBuffer()
      
      return {
        buffer: arrayBuffer,
        extension: 'png'
      }
    } catch (error) {
      console.warn('Could not load image for Excel:', error)
      return null
    }
  }

  // Filter and sort tenants
  const filteredTenants = useMemo(() => {
    let result = [...tenants]

    // Property filter
    if (selectedProperties.length > 0) {
      result = result.filter(tenant => {
        if (!tenant.property_code) return false
        return selectedProperties.includes(tenant.property_code)
      })
    }

    // Allocation filter
    if (allocationFilter === 'allocated') {
      result = result.filter(tenant => tenant.unit_id !== null)
    } else if (allocationFilter === 'unallocated') {
      result = result.filter(tenant => tenant.unit_id === null)
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(tenant => 
        tenant.first_name?.toLowerCase().includes(query) ||
        tenant.last_name?.toLowerCase().includes(query) ||
        tenant.national_id?.toLowerCase().includes(query) ||
        tenant.phone_number?.includes(query) ||
        tenant.email?.toLowerCase().includes(query) ||
        tenant.unit_code?.toLowerCase().includes(query)
      )
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'name_asc':
          return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
        case 'name_desc':
          return `${b.first_name} ${b.last_name}`.localeCompare(`${a.first_name} ${a.last_name}`)
        case 'created_at':
        default:
          return new Date(b.created_at) - new Date(a.created_at)
      }
    })

    return result
  }, [tenants, selectedProperties, allocationFilter, searchQuery, sortBy])

  // Toggle property selection
  const toggleProperty = (propertyCode) => {
    setSelectedProperties(prev => {
      if (prev.includes(propertyCode)) {
        return prev.filter(p => p !== propertyCode)
      } else {
        return [...prev, propertyCode]
      }
    })
  }

  // Select/Deselect all properties
  const toggleAllProperties = () => {
    if (selectedProperties.length === properties.length) {
      setSelectedProperties([])
    } else {
      setSelectedProperties(properties.map(p => p.property_code))
    }
  }

  // Toggle row expansion
  const toggleRowExpansion = (tenantId) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev)
      if (newSet.has(tenantId)) {
        newSet.delete(tenantId)
      } else {
        newSet.add(tenantId)
      }
      return newSet
    })
  }

  // Format phone for display (254xxx -> 0xxx)
  const formatPhone = (phone) => {
    if (!phone) return 'N/A'
    return phone.replace(/^254/, '0')
  }

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A'
    return new Date(dateStr).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  // Format currency
  const formatCurrency = (amount) => {
    if (!amount) return 'N/A'
    return `KES ${parseFloat(amount).toLocaleString()}`
  }

  // Open export modal
  const openExportModal = (type) => {
    setExportType(type)
    setIncludeImages(false)
    setShowExportModal(true)
  }

  // Convert image URL to base64 for PDF embedding
  const imageToBase64 = async (url) => {
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
    } catch (error) {
      console.error('Error converting image:', error)
      return null
    }
  }

  /**
   * Add company header to PDF
   */
  const addPDFCompanyHeader = async (doc, companyInfo, pageWidth) => {
    let yPos = 10
    const centerX = pageWidth / 2
    let logoAdded = false
    
    // Try to add logo
    if (companyInfo.logo) {
      try {
        console.log('🖼️ Attempting to add logo to PDF...')
        const logoBase64 = await fetchLogoAsBase64(companyInfo.logo, true)
        
        if (logoBase64) {
          const logoSize = 24
          const logoX = centerX - (logoSize / 2)
          
          doc.addImage(logoBase64, 'PNG', logoX, yPos, logoSize, logoSize)
          yPos += logoSize + 6
          logoAdded = true
          console.log('✅ Circular logo added to PDF')
        }
      } catch (error) {
        console.warn('⚠️ Could not add logo to PDF:', error.message)
      }
    }
    
    if (!logoAdded) {
      yPos += 5
    }
    
    // Company Name
    doc.setFontSize(16)
    doc.setTextColor(30, 64, 175)
    doc.setFont('helvetica', 'bold')
    doc.text(companyInfo.name || DEFAULT_COMPANY.name, centerX, yPos, { align: 'center' })
    yPos += 6
    
    // Contact Information
    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.setFont('helvetica', 'normal')
    
    // Address line
    if (companyInfo.address) {
      doc.text(companyInfo.address, centerX, yPos, { align: 'center' })
      yPos += 4
    }
    
    // Phone and Email line
    const contactParts = []
    if (companyInfo.phone) contactParts.push(`Tel: ${companyInfo.phone}`)
    if (companyInfo.email) contactParts.push(`Email: ${companyInfo.email}`)
    
    if (contactParts.length > 0) {
      doc.text(contactParts.join('  |  '), centerX, yPos, { align: 'center' })
      yPos += 4
    }
    
    // Divider line
    yPos += 2
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.5)
    doc.line(14, yPos, pageWidth - 14, yPos)
    yPos += 5
    
    return yPos
  }

  /**
   * Add page footer to PDF
   */
  const addPDFPageFooter = (doc, companyName, pageNumber, totalPages) => {
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.setFont('helvetica', 'italic')
    
    doc.text(`${companyName} - Confidential`, 14, pageHeight - 10)
    doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - 14, pageHeight - 10, { align: 'right' })
  }

  // Export to PDF
  const exportToPDF = async () => {
    setExporting(true)
    try {
      console.log('📄 Starting PDF export...')
      
      // Fetch company info
      const companyInfo = await fetchCompanyInfo()
      console.log('📋 Company info for PDF:', companyInfo)
      
      const doc = new jsPDF('l', 'mm', 'a4') // Landscape for more columns
      const pageWidth = doc.internal.pageSize.getWidth()
      
      // Add company header
      let yPos = await addPDFCompanyHeader(doc, companyInfo, pageWidth)
      
      // Report Title
      doc.setFontSize(14)
      doc.setTextColor(0, 0, 0)
      doc.setFont('helvetica', 'bold')
      doc.text('Tenant List Report', pageWidth / 2, yPos, { align: 'center' })
      yPos += 7
      
      // Subtitle with filters
      doc.setFontSize(9)
      doc.setTextColor(80, 80, 80)
      doc.setFont('helvetica', 'normal')
      const filterText = `Generated: ${new Date().toLocaleString()} | ` +
        `Properties: ${selectedProperties.length === 0 ? 'All' : selectedProperties.join(', ')} | ` +
        `Status: ${allocationFilter === 'all' ? 'All' : allocationFilter.charAt(0).toUpperCase() + allocationFilter.slice(1)} | ` +
        `Total: ${filteredTenants.length} tenants`
      doc.text(filterText, pageWidth / 2, yPos, { align: 'center' })
      yPos += 8

      if (includeImages) {
        // Full report with images - one tenant per page
        for (let i = 0; i < filteredTenants.length; i++) {
          const tenant = filteredTenants[i]
          
          if (i > 0) {
            doc.addPage()
            yPos = await addPDFCompanyHeader(doc, companyInfo, pageWidth)
          }

          // Tenant header
          doc.setFontSize(14)
          doc.setTextColor(30, 64, 175)
          doc.setFont('helvetica', 'bold')
          doc.text(`${tenant.first_name} ${tenant.last_name}`, 14, yPos)
          yPos += 8

          // Personal Info Section
          doc.setFontSize(11)
          doc.setTextColor(0, 0, 0)
          doc.setFont('helvetica', 'bold')
          doc.text('Personal Information', 14, yPos)
          yPos += 6

          doc.setFontSize(9)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(60, 60, 60)
          const personalInfo = [
            `National ID: ${tenant.national_id || 'N/A'}`,
            `Phone: ${formatPhone(tenant.phone_number)}`,
            `Email: ${tenant.email || 'N/A'}`,
            `Registered: ${formatDate(tenant.created_at)}`
          ]
          personalInfo.forEach(line => {
            doc.text(line, 14, yPos)
            yPos += 5
          })
          yPos += 3

          // Allocation Info Section
          doc.setFontSize(11)
          doc.setTextColor(0, 0, 0)
          doc.setFont('helvetica', 'bold')
          doc.text('Allocation Details', 14, yPos)
          yPos += 6

          doc.setFontSize(9)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(60, 60, 60)
          if (tenant.unit_id) {
            const allocationInfo = [
              `Property: ${tenant.property_name || 'N/A'}`,
              `Unit: ${tenant.unit_code || 'N/A'}`,
              `Monthly Rent: ${formatCurrency(tenant.monthly_rent)}`,
              `Deposit: ${formatCurrency(tenant.security_deposit)}`,
              `Arrears: ${formatCurrency(tenant.arrears_balance)}`,
              `Lease: ${formatDate(tenant.lease_start_date)} - ${formatDate(tenant.lease_end_date)}`
            ]
            allocationInfo.forEach(line => {
              doc.text(line, 14, yPos)
              yPos += 5
            })
          } else {
            doc.text('Status: Not Allocated', 14, yPos)
            yPos += 5
          }
          yPos += 3

          // Emergency Contact Section
          doc.setFontSize(11)
          doc.setTextColor(0, 0, 0)
          doc.setFont('helvetica', 'bold')
          doc.text('Emergency Contact', 14, yPos)
          yPos += 6

          doc.setFontSize(9)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(60, 60, 60)
          doc.text(`Name: ${tenant.emergency_contact_name || 'N/A'}`, 14, yPos)
          yPos += 5
          doc.text(`Phone: ${formatPhone(tenant.emergency_contact_phone)}`, 14, yPos)
          yPos += 8

          // ID Images Section
          if (tenant.id_front_image || tenant.id_back_image) {
            doc.setFontSize(11)
            doc.setTextColor(0, 0, 0)
            doc.setFont('helvetica', 'bold')
            doc.text('ID Documents', 14, yPos)
            yPos += 8

            let xPos = 14
            
            if (tenant.id_front_image) {
              try {
                const frontBase64 = await imageToBase64(tenant.id_front_image)
                if (frontBase64) {
                  doc.setFontSize(8)
                  doc.setTextColor(60, 60, 60)
                  doc.text('Front ID:', xPos, yPos)
                  doc.addImage(frontBase64, 'JPEG', xPos, yPos + 2, 60, 40)
                  xPos += 70
                }
              } catch (e) {
                doc.text('Front ID: Failed to load', xPos, yPos + 20)
                xPos += 70
              }
            }

            if (tenant.id_back_image) {
              try {
                const backBase64 = await imageToBase64(tenant.id_back_image)
                if (backBase64) {
                  doc.setFontSize(8)
                  doc.setTextColor(60, 60, 60)
                  doc.text('Back ID:', xPos, yPos)
                  doc.addImage(backBase64, 'JPEG', xPos, yPos + 2, 60, 40)
                }
              } catch (e) {
                doc.text('Back ID: Failed to load', xPos, yPos + 20)
              }
            }
          }
        }
      } else {
        // Summary table without images
        const tableData = filteredTenants.map(tenant => [
          `${tenant.first_name} ${tenant.last_name}`,
          tenant.national_id || 'N/A',
          formatPhone(tenant.phone_number),
          tenant.email || 'N/A',
          tenant.property_name || 'N/A',
          tenant.unit_code || 'N/A',
          tenant.unit_id ? 'Allocated' : 'Unallocated',
          formatCurrency(tenant.monthly_rent),
          formatDate(tenant.created_at)
        ])

        doc.autoTable({
          startY: yPos,
          head: [['Name', 'National ID', 'Phone', 'Email', 'Property', 'Unit', 'Status', 'Rent', 'Registered']],
          body: tableData,
          theme: 'striped',
          headStyles: { 
            fillColor: [30, 64, 175], 
            fontSize: 8,
            fontStyle: 'bold',
            halign: 'center'
          },
          bodyStyles: { fontSize: 7 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          columnStyles: {
            0: { cellWidth: 35 },
            1: { cellWidth: 25 },
            2: { cellWidth: 28 },
            3: { cellWidth: 40 },
            4: { cellWidth: 35 },
            5: { cellWidth: 20 },
            6: { cellWidth: 22, halign: 'center' },
            7: { cellWidth: 25, halign: 'right' },
            8: { cellWidth: 25, halign: 'center' }
          },
          margin: { left: 14, right: 14, bottom: 25 },
          didDrawPage: (data) => {
            const pageCount = doc.internal.getNumberOfPages()
            addPDFPageFooter(doc, companyInfo.name, data.pageNumber, pageCount)
          }
        })
      }

      // Add footer to last page if using includeImages mode
      if (includeImages) {
        const totalPages = doc.internal.getNumberOfPages()
        for (let i = 1; i <= totalPages; i++) {
          doc.setPage(i)
          addPDFPageFooter(doc, companyInfo.name, i, totalPages)
        }
      }

      // Save
      const filename = `Tenants_Report_${new Date().toISOString().split('T')[0]}.pdf`
      doc.save(filename)
      console.log('✅ PDF exported successfully:', filename)
      setShowExportModal(false)
    } catch (error) {
      console.error('❌ PDF export error:', error)
      alert('Failed to export PDF. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  // Export to Excel
  const exportToExcel = async () => {
    setExporting(true)
    try {
      console.log('📊 Starting Excel export...')
      
      // Fetch company info
      const companyInfo = await fetchCompanyInfo()
      console.log('📋 Company info for Excel:', companyInfo)
      
      const workbook = new ExcelJS.Workbook()
      workbook.creator = companyInfo.name || 'Zakaria Rental System'
      workbook.created = new Date()

      const worksheet = workbook.addWorksheet('Tenants')

      // Define columns based on includeImages option
      const columns = [
        { header: 'Name', key: 'name', width: 25 },
        { header: 'National ID', key: 'national_id', width: 15 },
        { header: 'Phone', key: 'phone', width: 15 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Property', key: 'property', width: 25 },
        { header: 'Unit', key: 'unit', width: 12 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Monthly Rent', key: 'rent', width: 15 },
        { header: 'Deposit', key: 'deposit', width: 15 },
        { header: 'Arrears', key: 'arrears', width: 15 },
        { header: 'Lease Start', key: 'lease_start', width: 15 },
        { header: 'Lease End', key: 'lease_end', width: 15 },
        { header: 'Emergency Contact', key: 'emergency_name', width: 20 },
        { header: 'Emergency Phone', key: 'emergency_phone', width: 15 },
        { header: 'Registered', key: 'registered', width: 15 }
      ]

      if (includeImages) {
        columns.push(
          { header: 'ID Front Image', key: 'id_front', width: 50 },
          { header: 'ID Back Image', key: 'id_back', width: 50 }
        )
      }

      const columnCount = columns.length
      const lastCol = String.fromCharCode(64 + Math.min(columnCount, 26))
      let currentRow = 1

      // Add company logo
      if (companyInfo.logo) {
        try {
          const logoData = await fetchImageAsBuffer(companyInfo.logo)
          
          if (logoData) {
            const imageId = workbook.addImage({
              buffer: logoData.buffer,
              extension: logoData.extension,
            })
            
            const logoCol = Math.floor(columnCount / 2)
            worksheet.addImage(imageId, {
              tl: { col: logoCol - 0.5, row: 0 },
              ext: { width: 60, height: 60 }
            })
            
            // Add empty rows for logo space
            worksheet.addRow([])
            worksheet.addRow([])
            worksheet.addRow([])
            worksheet.addRow([])
            currentRow = 5
            
            worksheet.getRow(1).height = 20
            worksheet.getRow(2).height = 20
            worksheet.getRow(3).height = 20
            worksheet.getRow(4).height = 10
            
            console.log('✅ Logo added to Excel')
          }
        } catch (error) {
          console.warn('Could not add logo to Excel:', error)
        }
      }

      // Company Name
      const nameRow = worksheet.addRow([companyInfo.name || DEFAULT_COMPANY.name])
      nameRow.font = { size: 16, bold: true, color: { argb: 'FF1E40AF' } }
      nameRow.alignment = { horizontal: 'center', vertical: 'middle' }
      nameRow.height = 28
      worksheet.mergeCells(`A${currentRow}:${lastCol}${currentRow}`)
      currentRow++

      // Address line
      if (companyInfo.address) {
        const addressRow = worksheet.addRow([companyInfo.address])
        addressRow.font = { size: 10, color: { argb: 'FF6B7280' } }
        addressRow.alignment = { horizontal: 'center' }
        addressRow.height = 18
        worksheet.mergeCells(`A${currentRow}:${lastCol}${currentRow}`)
        currentRow++
      }

      // Contact Info line
      const contactParts = []
      if (companyInfo.phone) contactParts.push(`Tel: ${companyInfo.phone}`)
      if (companyInfo.email) contactParts.push(`Email: ${companyInfo.email}`)
      
      if (contactParts.length > 0) {
        const contactRow = worksheet.addRow([contactParts.join('  |  ')])
        contactRow.font = { size: 10, color: { argb: 'FF6B7280' } }
        contactRow.alignment = { horizontal: 'center' }
        contactRow.height = 18
        worksheet.mergeCells(`A${currentRow}:${lastCol}${currentRow}`)
        currentRow++
      }

      // Empty row for spacing
      worksheet.addRow([])
      currentRow++

      // Report Title
      const titleRow = worksheet.addRow(['Tenant List Report'])
      titleRow.font = { size: 14, bold: true }
      titleRow.alignment = { horizontal: 'center' }
      titleRow.height = 24
      worksheet.mergeCells(`A${currentRow}:${lastCol}${currentRow}`)
      currentRow++

      // Metadata rows
      worksheet.addRow([])
      currentRow++

      const metaRow1 = worksheet.addRow(['Generated on:', new Date().toLocaleString()])
      metaRow1.getCell(1).font = { bold: true }
      currentRow++

      const metaRow2 = worksheet.addRow(['Total Records:', filteredTenants.length])
      metaRow2.getCell(1).font = { bold: true }
      currentRow++

      const filterInfo = `Properties: ${selectedProperties.length === 0 ? 'All' : selectedProperties.join(', ')} | Status: ${allocationFilter}`
      const metaRow3 = worksheet.addRow(['Filters:', filterInfo])
      metaRow3.getCell(1).font = { bold: true }
      currentRow++

      // Empty row before data
      worksheet.addRow([])
      currentRow++

      // Set columns
      worksheet.columns = columns

      // Add header row
      const headerRow = worksheet.addRow(columns.map(c => c.header))
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E40AF' }
      }
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' }
      headerRow.height = 22
      headerRow.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF1E40AF' } },
          left: { style: 'thin', color: { argb: 'FF1E40AF' } },
          bottom: { style: 'thin', color: { argb: 'FF1E40AF' } },
          right: { style: 'thin', color: { argb: 'FF1E40AF' } }
        }
      })

      // Add data rows
      filteredTenants.forEach((tenant, index) => {
        const rowData = [
          `${tenant.first_name} ${tenant.last_name}`,
          tenant.national_id || 'N/A',
          formatPhone(tenant.phone_number),
          tenant.email || 'N/A',
          tenant.property_name || 'N/A',
          tenant.unit_code || 'N/A',
          tenant.unit_id ? 'Allocated' : 'Unallocated',
          tenant.monthly_rent ? parseFloat(tenant.monthly_rent) : 'N/A',
          tenant.security_deposit ? parseFloat(tenant.security_deposit) : 'N/A',
          tenant.arrears_balance ? parseFloat(tenant.arrears_balance) : 'N/A',
          tenant.lease_start_date ? new Date(tenant.lease_start_date) : 'N/A',
          tenant.lease_end_date ? new Date(tenant.lease_end_date) : 'N/A',
          tenant.emergency_contact_name || 'N/A',
          formatPhone(tenant.emergency_contact_phone),
          new Date(tenant.created_at)
        ]

        if (includeImages) {
          rowData.push(tenant.id_front_image || 'N/A')
          rowData.push(tenant.id_back_image || 'N/A')
        }

        const row = worksheet.addRow(rowData)
        
        // Alternate row styling
        if (index % 2 === 1) {
          row.eachCell((cell) => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF8FAFC' }
            }
          })
        }

        // Add borders
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
          }
        })

        // Make image URLs clickable hyperlinks
        if (includeImages) {
          if (tenant.id_front_image) {
            const frontCell = row.getCell(columns.length - 1)
            frontCell.value = {
              text: 'View Front ID',
              hyperlink: tenant.id_front_image
            }
            frontCell.font = { color: { argb: 'FF0000FF' }, underline: true }
          }
          if (tenant.id_back_image) {
            const backCell = row.getCell(columns.length)
            backCell.value = {
              text: 'View Back ID',
              hyperlink: tenant.id_back_image
            }
            backCell.font = { color: { argb: 'FF0000FF' }, underline: true }
          }
        }
      })

      // Add footer
      worksheet.addRow([])
      const footerRow = worksheet.addRow([`${companyInfo.name} - Confidential Report`])
      footerRow.font = { italic: true, color: { argb: 'FF9CA3AF' }, size: 9 }
      footerRow.alignment = { horizontal: 'center' }
      worksheet.mergeCells(`A${footerRow.number}:${lastCol}${footerRow.number}`)

      // Generate and download
      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `Tenants_Report_${new Date().toISOString().split('T')[0]}.xlsx`
      link.click()
      window.URL.revokeObjectURL(url)
      
      console.log('✅ Excel exported successfully')
      setShowExportModal(false)
    } catch (error) {
      console.error('❌ Excel export error:', error)
      alert('Failed to export Excel. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  // Handle export
  const handleExport = () => {
    if (exportType === 'pdf') {
      exportToPDF()
    } else if (exportType === 'excel') {
      exportToExcel()
    }
  }

  // Clear all filters
  const clearFilters = () => {
    setSelectedProperties([])
    setAllocationFilter('all')
    setSearchQuery('')
    setSortBy('created_at')
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-gray-600">Loading tenants...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-red-500">
        <AlertCircle className="h-12 w-12 mb-4" />
        <p>{error}</p>
        <button
          onClick={fetchData}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Users className="h-6 w-6 text-blue-500" />
            Tenant Browser
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            View and manage all tenants across properties
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="p-2 text-gray-500 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
          <button
            onClick={() => openExportModal('pdf')}
            className="flex items-center gap-2 px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm"
          >
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">PDF</span>
          </button>
          <button
            onClick={() => openExportModal('excel')}
            className="flex items-center gap-2 px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span className="hidden sm:inline">Excel</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, ID, phone, email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Property Filter Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowPropertyDropdown(!showPropertyDropdown)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 text-sm"
            >
              <Building2 className="h-4 w-4 text-gray-500" />
              <span>
                {selectedProperties.length === 0
                  ? 'All Properties'
                  : `${selectedProperties.length} Selected`}
              </span>
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </button>

            {showPropertyDropdown && (
              <div className="absolute z-20 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg">
                <div className="p-2 border-b border-gray-100">
                  <button
                    onClick={toggleAllProperties}
                    className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded"
                  >
                    {selectedProperties.length === properties.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className="max-h-60 overflow-y-auto p-2">
                  {properties.map(property => (
                    <label
                      key={property.id}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedProperties.includes(property.property_code)}
                        onChange={() => toggleProperty(property.property_code)}
                        className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{property.name}</span>
                      <span className="text-xs text-gray-400">({property.property_code})</span>
                    </label>
                  ))}
                </div>
                <div className="p-2 border-t border-gray-100">
                  <button
                    onClick={() => setShowPropertyDropdown(false)}
                    className="w-full px-3 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Allocation Filter */}
          <select
            value={allocationFilter}
            onChange={(e) => setAllocationFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Status</option>
            <option value="allocated">Allocated</option>
            <option value="unallocated">Unallocated</option>
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="created_at">Newest First</option>
            <option value="name_asc">Name (A-Z)</option>
            <option value="name_desc">Name (Z-A)</option>
          </select>

          {/* Clear Filters */}
          {(selectedProperties.length > 0 || allocationFilter !== 'all' || searchQuery || sortBy !== 'created_at') && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            >
              <X className="h-4 w-4" />
              Clear
            </button>
          )}
        </div>

        {/* Results count */}
        <div className="text-sm text-gray-500">
          Showing {filteredTenants.length} of {tenants.length} tenants
        </div>
      </div>

      {/* Tenant List */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {filteredTenants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Users className="h-12 w-12 mb-4 text-gray-300" />
            <p className="text-lg font-medium">No tenants found</p>
            <p className="text-sm">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tenant
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                    Contact
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
                    Property / Unit
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                    Rent
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                    Registered
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredTenants.map(tenant => (
                  <React.Fragment key={tenant.id}>
                    {/* Main Row */}
                    <tr className={`hover:bg-gray-50 ${expandedRows.has(tenant.id) ? 'bg-blue-50' : ''}`}>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                            <User className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">
                              {tenant.first_name} {tenant.last_name}
                            </div>
                            <div className="text-sm text-gray-500">
                              ID: {tenant.national_id}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 hidden sm:table-cell">
                        <div className="text-sm text-gray-900">{formatPhone(tenant.phone_number)}</div>
                        <div className="text-sm text-gray-500 truncate max-w-[200px]">{tenant.email}</div>
                      </td>
                      <td className="px-4 py-4 hidden md:table-cell">
                        {tenant.unit_id ? (
                          <div>
                            <div className="text-sm font-medium text-gray-900">{tenant.property_name}</div>
                            <div className="text-sm text-gray-500">Unit: {tenant.unit_code}</div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400 italic">Not assigned</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {tenant.unit_id ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Allocated
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            Unallocated
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 hidden lg:table-cell">
                        <div className="text-sm text-gray-900">
                          {tenant.monthly_rent ? formatCurrency(tenant.monthly_rent) : '-'}
                        </div>
                      </td>
                      <td className="px-4 py-4 hidden lg:table-cell">
                        <div className="text-sm text-gray-500">{formatDate(tenant.created_at)}</div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <button
                          onClick={() => toggleRowExpansion(tenant.id)}
                          className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          {expandedRows.has(tenant.id) ? (
                            <ChevronUp className="h-5 w-5" />
                          ) : (
                            <ChevronDown className="h-5 w-5" />
                          )}
                        </button>
                      </td>
                    </tr>

                    {/* Expanded Details Row */}
                    {expandedRows.has(tenant.id) && (
                      <tr className="bg-blue-50">
                        <td colSpan="7" className="px-4 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Personal Info */}
                            <div className="space-y-3">
                              <h4 className="font-medium text-gray-900 flex items-center gap-2">
                                <User className="h-4 w-4 text-blue-500" />
                                Personal Information
                              </h4>
                              <div className="space-y-2 text-sm">
                                <p><span className="text-gray-500">National ID:</span> {tenant.national_id}</p>
                                <p><span className="text-gray-500">Phone:</span> {formatPhone(tenant.phone_number)}</p>
                                <p><span className="text-gray-500">Email:</span> {tenant.email || 'N/A'}</p>
                                <p><span className="text-gray-500">Registered:</span> {formatDate(tenant.created_at)}</p>
                              </div>
                            </div>

                            {/* Allocation Info */}
                            <div className="space-y-3">
                              <h4 className="font-medium text-gray-900 flex items-center gap-2">
                                <Home className="h-4 w-4 text-blue-500" />
                                Allocation Details
                              </h4>
                              {tenant.unit_id ? (
                                <div className="space-y-2 text-sm">
                                  <p><span className="text-gray-500">Property:</span> {tenant.property_name}</p>
                                  <p><span className="text-gray-500">Unit:</span> {tenant.unit_code}</p>
                                  <p><span className="text-gray-500">Rent:</span> {formatCurrency(tenant.monthly_rent)}</p>
                                  <p><span className="text-gray-500">Deposit:</span> {formatCurrency(tenant.security_deposit)}</p>
                                  <p><span className="text-gray-500">Arrears:</span> {formatCurrency(tenant.arrears_balance)}</p>
                                  <p><span className="text-gray-500">Lease:</span> {formatDate(tenant.lease_start_date)} - {formatDate(tenant.lease_end_date)}</p>
                                </div>
                              ) : (
                                <p className="text-sm text-gray-500 italic">Not currently allocated to any unit</p>
                              )}
                            </div>

                            {/* Emergency Contact & ID Images */}
                            <div className="space-y-3">
                              <h4 className="font-medium text-gray-900 flex items-center gap-2">
                                <Phone className="h-4 w-4 text-blue-500" />
                                Emergency Contact
                              </h4>
                              <div className="space-y-2 text-sm">
                                <p><span className="text-gray-500">Name:</span> {tenant.emergency_contact_name || 'N/A'}</p>
                                <p><span className="text-gray-500">Phone:</span> {formatPhone(tenant.emergency_contact_phone)}</p>
                              </div>

                              {/* ID Images */}
                              <h4 className="font-medium text-gray-900 flex items-center gap-2 mt-4">
                                <Image className="h-4 w-4 text-blue-500" />
                                ID Documents
                              </h4>
                              <div className="flex gap-4">
                                {tenant.id_front_image ? (
                                  <a
                                    href={tenant.id_front_image}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                    Front ID
                                  </a>
                                ) : (
                                  <span className="text-sm text-gray-400">No front ID</span>
                                )}
                                {tenant.id_back_image ? (
                                  <a
                                    href={tenant.id_back_image}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                    Back ID
                                  </a>
                                ) : (
                                  <span className="text-sm text-gray-400">No back ID</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowExportModal(false)} />
            
            <div className="relative inline-block bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
                <div className="flex items-center gap-3 mb-4">
                  {exportType === 'pdf' ? (
                    <FileText className="h-8 w-8 text-red-500" />
                  ) : (
                    <FileSpreadsheet className="h-8 w-8 text-green-500" />
                  )}
                  <h3 className="text-lg font-medium text-gray-900">
                    Export to {exportType === 'pdf' ? 'PDF' : 'Excel'}
                  </h3>
                </div>

                <div className="space-y-4">
                  <p className="text-sm text-gray-500">
                    Export {filteredTenants.length} tenant(s) with current filters applied.
                  </p>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeImages}
                        onChange={(e) => setIncludeImages(e.target.checked)}
                        className="mt-1 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                      />
                      <div>
                        <span className="font-medium text-gray-900">Include ID Images</span>
                        <p className="text-sm text-gray-500 mt-1">
                          {exportType === 'pdf' 
                            ? 'Embed ID images directly in the PDF (larger file size, one tenant per page)'
                            : 'Add clickable links to ID images in Excel'
                          }
                        </p>
                      </div>
                    </label>
                  </div>

                  {includeImages && exportType === 'pdf' && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                      <p className="text-sm text-yellow-700">
                        <strong>Note:</strong> Including images may take longer to generate and result in a larger file.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-gray-50 px-4 py-3 sm:px-6 flex flex-col sm:flex-row-reverse gap-2">
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  className={`w-full sm:w-auto inline-flex justify-center items-center gap-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white ${
                    exportType === 'pdf' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
                  } focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                    exportType === 'pdf' ? 'focus:ring-red-500' : 'focus:ring-green-500'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {exporting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Export
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowExportModal(false)}
                  disabled={exporting}
                  className="w-full sm:w-auto inline-flex justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close property dropdown */}
      {showPropertyDropdown && (
        <div 
          className="fixed inset-0 z-10" 
          onClick={() => setShowPropertyDropdown(false)}
        />
      )}
    </div>
  )
}

export default AdminTenantBrowser