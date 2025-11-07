'use client'

import React, {
    createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react'

const STORAGE_KEY = 'create-order:v3' // bumped to avoid stale shapes

export type Gender = 'MALE' | 'FEMALE' | 'OTHERS'
export type MeasurementOption = 'NEW' | 'USE_LAST' | 'REUSE_CURRENT'

export type ItemParam = {
    id: number
    nameEn: string
    nameBn: string
    unit: string | null
    type: string | null
    nsId: string
    suggestiveValues: string[] | null
}

export type PhotosMap = Partial<Record<
    'orderCloth' | 'designPhoto' | 'patternPhoto' | 'measurementCloth' | 'designSketch',
    string
>>
export type PhotoKey = keyof PhotosMap

// A committed item in the order
export type OrderItem = {
    itemId: number
    itemType?: string
    itemParameters?: ItemParam[]
    measurementOption: MeasurementOption
    measurementValues?: Record<string | number, string | number | boolean>
    makingCharge: number
    urgentDelivery?: boolean
    deliveryDate?: string | null
    photos?: PhotosMap
}

export type CreateOrderState = {
    shopId?: number
    phone: string
    name: string
    gender: Gender

    // Working item fields (single-item editor)
    makingCharge?: number | ''
    urgentDelivery?: boolean
    deliveryDate?: string | null
    itemId?: number
    itemType?: string
    itemParameters?: ItemParam[]
    measurementOption: MeasurementOption
    measurementValues?: Record<string | number, string | number | boolean>
    photos?: PhotosMap

    // Committed items
    orderItems?: OrderItem[]

    // Order-level delivery date for non-urgent items
    remainingDeliveryDate?: string | null
}

type Ctx = {
    state: CreateOrderState
    setState: React.Dispatch<React.SetStateAction<CreateOrderState>>
    reset: () => void

    // Existing helpers
    selectItem: (args: { id?: number; name?: string; params?: ItemParam[] }) => void
    setMeasurementOption: (opt: MeasurementOption) => void
    setMeasurementValues: (patch: Record<string | number, string | number | boolean>) => void
    setPhoto: (key: PhotoKey, dataUrl?: string) => void
    clearPhotos: () => void
    setExtras: (patch: Partial<Pick<CreateOrderState, 'makingCharge' | 'urgentDelivery' | 'deliveryDate' | 'remainingDeliveryDate'>>) => void

    // New multi-item helpers
    addCurrentItem: () => { ok: true } | { ok: false; reason: string }
    startNewItem: () => void
}

const defaultState: CreateOrderState = {
    phone: '',
    name: '',
    gender: 'MALE',

    itemId: undefined,
    itemType: undefined,
    itemParameters: [],

    measurementOption: 'NEW',
    measurementValues: {},
    makingCharge: '',
    urgentDelivery: false,
    deliveryDate: null,
    photos: {},

    orderItems: [],

    remainingDeliveryDate: null,
}

function loadInitial(): CreateOrderState {
    if (typeof window === 'undefined') return defaultState
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY)
        const parsed = raw ? JSON.parse(raw) : {}
        // Merge so newly added fields get defaults
        return { ...defaultState, ...parsed }
    } catch {
        return defaultState
    }
}

const CreateOrderContext = createContext<Ctx | null>(null)

function clearWorkingFields(s: CreateOrderState): CreateOrderState {
    return {
        ...s,
        itemId: undefined,
        itemType: undefined,
        itemParameters: [],
        measurementOption: 'NEW',
        measurementValues: {},
        makingCharge: '',
        urgentDelivery: false,
        deliveryDate: null,
        photos: {},
    }
}

export function CreateOrderProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<CreateOrderState>(loadInitial)

    useEffect(() => {
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
        } catch {}
    }, [state])

    const reset = useCallback(() => setState(defaultState), [])

    const selectItem: Ctx['selectItem'] = useCallback(({ id, name, params }) => {
        setState(s => ({
            ...s,
            itemId: id ?? s.itemId,
            itemType: name ?? s.itemType,
            itemParameters: params ?? s.itemParameters,
        }))
    }, [])

    const setMeasurementOption = useCallback<Ctx['setMeasurementOption']>((opt) => {
        setState(s => ({ ...s, measurementOption: opt }))
    }, [])

    const setMeasurementValues = useCallback<Ctx['setMeasurementValues']>((patch) => {
        setState(s => ({ ...s, measurementValues: { ...(s.measurementValues ?? {}), ...patch } }))
    }, [])

    const setPhoto = useCallback<Ctx['setPhoto']>((key, dataUrl) => {
        setState(s => ({ ...s, photos: { ...(s.photos ?? {}), [key]: dataUrl } }))
    }, [])

    const clearPhotos = useCallback<Ctx['clearPhotos']>(() => {
        setState(s => ({ ...s, photos: {} }))
    }, [])

    const setExtras = useCallback<Ctx['setExtras']>((patch) => {
        setState(s => ({ ...s, ...patch }))
    }, [])

    // Commit current working item to orderItems and reset working fields
    const addCurrentItem = useCallback<Ctx['addCurrentItem']>(() => {
        let reason: string | undefined
        setState(prev => {
            if (!prev.itemId) { reason = 'No item selected'; return prev }
            const making =
                typeof prev.makingCharge === 'number' ? prev.makingCharge :
                    prev.makingCharge === '' || prev.makingCharge == null ? NaN : Number(prev.makingCharge)
            if (!Number.isFinite(making)) { reason = 'Invalid making charge'; return prev }

            const newItem: OrderItem = {
                itemId: prev.itemId,
                itemType: prev.itemType,
                itemParameters: prev.itemParameters,
                measurementOption: prev.measurementOption,
                measurementValues: prev.measurementValues,
                makingCharge: making,
                urgentDelivery: prev.urgentDelivery,
                deliveryDate: prev.deliveryDate ?? null,
                photos: prev.photos,
            }
            const nextItems = [...(prev.orderItems ?? []), newItem]
            return { ...clearWorkingFields(prev), orderItems: nextItems }
        })
        return reason ? { ok: false as const, reason } : { ok: true as const }
    }, [])

    const startNewItem = useCallback<Ctx['startNewItem']>(() => {
        setState(s => clearWorkingFields(s))
    }, [])

    const value = useMemo<Ctx>(() => ({
        state,
        setState,
        reset,
        selectItem,
        setMeasurementOption,
        setMeasurementValues,
        setPhoto,
        clearPhotos,
        setExtras,
        addCurrentItem,
        startNewItem,
    }), [
        state, reset, selectItem, setMeasurementOption, setMeasurementValues,
        setPhoto, clearPhotos, setExtras, addCurrentItem, startNewItem,
    ])

    return (
        <CreateOrderContext.Provider value={value}>
            {children}
        </CreateOrderContext.Provider>
    )
}

export function useCreateOrder() {
    const ctx = useContext(CreateOrderContext)
    if (!ctx) throw new Error('useCreateOrder must be used within CreateOrderProvider')
    return ctx
}