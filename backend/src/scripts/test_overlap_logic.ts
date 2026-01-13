
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { supabase } from '../db/supabase.js';

// Load env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function run() {
    console.log('--- Testing Overlap Logic ---');
    const slotsService = await import('../services/slotsService.js');

    const date = '2025-12-25';
    // Clean up
    await supabase.from('time_slots').delete().eq('date', date);

    // Test 1: Create 1h slot at 10:00. then try to create 1h at 10:30. Should FAIL.
    console.log('\n[Test 1] 1h Slot (10:00) vs 1h Slot (10:30)');
    await slotsService.createSlot({ date, time: '10:00', eventType: 'online', priceCategory: 'padrao' });
    console.log('Created 10:00 (1h)');

    try {
        await slotsService.createSlot({ date, time: '10:30', eventType: 'online', priceCategory: 'padrao' });
        console.error('FAIL: Should have blocked 10:30 creation');
    } catch (e: any) {
        console.log('PASS: Blocked as expected:', e.message);
    }

    // Clean up
    await supabase.from('time_slots').delete().eq('date', date);

    // Test 2: Create 1h slot at 10:00. then try to create 1h at 09:30. Should FAIL.
    console.log('\n[Test 2] 1h Slot (10:00) vs 1h Slot (09:30)');
    await slotsService.createSlot({ date, time: '10:00', eventType: 'online', priceCategory: 'padrao' });
    console.log('Created 10:00 (1h)');

    try {
        await slotsService.createSlot({ date, time: '09:30', eventType: 'online', priceCategory: 'padrao' });
        console.error('FAIL: Should have blocked 09:30 creation');
    } catch (e: any) {
        console.log('PASS: Blocked as expected:', e.message);
    }

    // Clean up
    await supabase.from('time_slots').delete().eq('date', date);

    // Test 3: Create 1h slot at 10:00. Try create Personal (30m) at 09:30. Should PASS.
    console.log('\n[Test 3] 1h Slot (10:00) vs Personal 30m (09:30)');
    await slotsService.createSlot({ date, time: '10:00', eventType: 'online', priceCategory: 'padrao' });
    console.log('Created 10:00 (1h)');

    try {
        await slotsService.createSlot({ date, time: '09:30', eventType: 'personal', status: 'Almoço' });
        console.log('PASS: Created 09:30 (30m) successfully');
    } catch (e: any) {
        console.error('FAIL: Blocked valid creation:', e.message);
    }

    // Test 4: Create 1h slot at 10:00. Try create Personal (30m) at 10:30. Should FAIL (overlap internal).
    // 10:00 is Online/1h -> Ends 11:00.
    // 10:30 starts inside 10:00.
    // DOES OUR LOGIC CHECK THIS?
    // checkOverlapConflicts(date, time, isOneHour)
    // For 10:30 (30m): isOneHour = false.
    // Checks T-30 (10:00): Exists? YES. Is 1h? YES. -> CONFLICT.
    console.log('\n[Test 4] 1h Slot (10:00) vs Personal 30m (10:30)');
    try {
        await slotsService.createSlot({ date, time: '10:30', eventType: 'personal', status: 'Lanche' });
        console.error('FAIL: Should have blocked 10:30 creation (inside 10:00)');
    } catch (e: any) {
        console.log('PASS: Blocked as expected:', e.message);
    }

    // Cleanup
    await supabase.from('time_slots').delete().eq('date', date);
}

run().catch(console.error);
