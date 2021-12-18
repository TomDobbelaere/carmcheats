#!/usr/bin/env python

import argparse
import sys
import z3

from carmcheat.algorithm import hash2str, str2hash, cheat_length_range, hash_init, hash_update, hash_final


def char_to_val(x):
    return ord(x.lower()) - ord("a") + 22


def z3_hash_step(code1, code2, sum, inp):
    sum += inp
    code1 += (inp << 11)
    code = z3.LShR(code1, 17) + (code1 << 4)
    code2 = z3.LShR(code2, 29) + (code2 << 3) + inp * inp
    return code, code2, sum


def z3_hash_final(code1, code2, sum):
    return z3.LShR(code1, 11) + (sum << 21), code2


def recursive_crib_iterator(result, remaining_cribs):
    if not remaining_cribs:
        return result


def run(target_hash, length, crib, database, database_filename=None, check_intermediates=True, force=False):
    min_length, max_length = cheat_length_range(target_hash)
    for offset in range(length - len(crib) + 1):
        s = z3.Solver()

        # Create Z3 keycode objects
        # FIXME: Their range is [22, 22+26]=[22,48], will reducing their bit width to 6 make the algorithm faster?
        keycodes = [z3.BitVec(f"k_{i}", 32) for i in range(length)]

        # All characters are 22 + [a-z]
        for k in keycodes:
            s.add(k >= 22)
            s.add(k < 22 + 26)

        # Apply the "crib" to the input characters
        for c, k in zip(crib, keycodes[offset:]):
            s.add(k == char_to_val(c))

        # Exclude all items from the database
        for dbitem in database:
            s.add(z3.Or(*[k != char_to_val(dbitem[ki]) for ki, k in enumerate(keycodes)]))

        # Store all intermediate hash results in this list
        intermediates = []

        # Apply the Carmageddon hashing algorithm to the keycodes
        code1 = code2 = sum = z3.BitVecVal(0, 32)
        for k_i, k in enumerate(keycodes, 1):
            # One step of the hash
            code1, code2, sum = z3_hash_step(code1, code2, sum, k)
            if check_intermediates and (force or min_length <= k_i <= max_length):
                # Calculate the final hash for each intermediate key code ==> string is shorter
                final = z3_hash_final(code1, code2, sum)
                intermediates.append(final)

        if intermediates:
            # Generate a success when an intermediate hash matches the target hash
            s.add(z3.Or(*[z3.And(intermediate[0] == target_hash[0], intermediate[1] == target_hash[1]) for intermediate in intermediates]))
        else:
            # Generate a success when the final hash matches the target hash
            final = z3_hash_final(code1, code2, sum)
            s.add(z3.And(final[0] == target_hash[0], final[1] == target_hash[1]))

        while (t := s.check()) == z3.sat:
            full_cleartext = "".join(chr(s.model()[k].as_long() + ord('a') - 22) for k in keycodes)
            if check_intermediates:
                state = hash_init()
                for c_i, char in enumerate(full_cleartext, 1):
                    state = hash_update(*state, char)
                    final = hash_final(*state)
                    if final == target_hash:
                        cleartext = full_cleartext[:c_i]
                        excluded_keycodes = [k for k in keycodes[:c_i]]
                        break
                else:
                    print("Error: no intermediate hash matches the target hash!", file=sys.stderr)
                    cleartext = full_cleartext
                    excluded_keycodes = keycodes
            else:
                cleartext = full_cleartext
                excluded_keycodes = keycodes
            s.add(z3.Or(*[k != s.model()[k].as_long() for k in excluded_keycodes]))
            print(f"{hash2str(target_hash)}:{cleartext}")
            if database_filename:
                with open(database_filename, "a") as fn:
                    fn.write(f"{hash2str(target_hash)}:{cleartext}\n")
        if not crib:
            break  # don't needlessly loop when no crib


def main():
    parser = argparse.ArgumentParser(allow_abbrev=False,
                                     description="Use SAT solver to find cheat codes hashing to a target")
    parser.add_argument("target", help="Target hash (format=XXXXXXXX:XXXXXXXX), where X is hexadecimal")
    parser.add_argument("length", type=int, help="Length(s) of cheat code to check/find")
    parser.add_argument("--crib", default="", help="Find only cheat codes that contain the 'crib'")
    parser.add_argument("--database", metavar="DB", help="Append found cheat codes to this database")
    parser.add_argument("--intermediates", action="store_true", help="Match intermediates")
    parser.add_argument("--force", action="store_true", help="Force search")
    args = parser.parse_args()

    hash_target_str = args.target.strip()

    try:
        target_hash = str2hash(hash_target_str)
    except ValueError:
        parser.error("Invalid target. It needs to be in the XXXXXXXX:XXXXXXXX format.")

    database = []
    if args.database:
        try:
            for line in open(args.database, "r").readlines():
                hash_str, cleartext = line.strip().rsplit(":", 1)
                if hash_str == hash_target_str and len(cleartext) == args.length:
                    database.append(cleartext)
        except FileNotFoundError:
            pass

    cheat_min_length, cheat_max_length = cheat_length_range(target_hash)
    print(f"Cheat length range: [{cheat_min_length}, {cheat_max_length}]")
    print(f"Looking for cheat codes hashing to {hash_target_str}")

    if database:
        print(f"Found {len(database)} entries in the database:")
        for entry in database:
            print(f"{hash_target_str}:{entry}")

    if not args.force:
        if not args.intermediates and not cheat_min_length < args.length < cheat_max_length:
            print(f"Length={args.length} is out of range [{cheat_min_length},{cheat_max_length}] => skipping search (use --force to override)")
            return

    run(target_hash, args.length, args.crib, database, database_filename=args.database,
        check_intermediates=args.intermediates, force=args.force)

    print(f"Search finished")


if __name__ == "__main__":
    raise SystemExit(main())
