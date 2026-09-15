#include <vector>
#include <cassert>
#include <iostream>
#include <algorithm>
using namespace std;

int firstMissingPositive(vector<int>& nums) {
    int n = nums.size();
    for (int i = 0; i < n; ++i) {
        while (nums[i] >= 1 && nums[i] <= n
               && nums[i] != nums[nums[i] - 1]) {
            swap(nums[i], nums[nums[i] - 1]);
        }
    }
    for (int i = 0; i < n; ++i) {
        if (nums[i] != i + 1) return i + 1;
    }
    return n + 1;
}

int main() {
    auto test = [](vector<int> nums, int expected) {
        int result = firstMissingPositive(nums);
        assert(result == expected);
        cout << "PASS: " << expected << endl;
    };
    test({1, 2, 0}, 3);
    test({3, 4, -1, 1}, 2);
    test({7, 8, 9, 11, 12}, 1);
    test({1}, 2);
    test({0}, 1);
    test({-1, -2}, 1);
    test({1, 1}, 2);
    cout << "All tests passed!" << endl;
}
